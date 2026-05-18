"""意图搜索：用户输入想学的内容，AI 自动生成学习材料并出题"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.quiz_gen import _build_prompt as build_quiz_prompt, _parse_batch_quiz_json
from services.rag import chunk_text, embed_and_store, get_random_chunks
from models.database import SessionLocal, Material, Question, Setting
from services.crypto import decrypt
from config import ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
import httpx

router = APIRouter()


class IntentRequest(BaseModel):
    query: str


INTENT_CONTENT_PROMPT = """你是一位资深教育内容作者。用户想学习以下主题：

{query}

请撰写一篇高质量的中文学习材料，要求：
- 结构清晰，用 Markdown 格式（## 标题、列表等）
- 覆盖核心概念、关键原理、实践要点
- 语言通俗易懂，适合初学者
- 长度 1500-2500 字
- 纯知识内容，不要加"以下是学习材料"之类的前言

直接输出 Markdown 格式的内容："""


def _get_api_key() -> str:
    """Get API key: user-set key first, then server env var."""
    db = SessionLocal()
    try:
        s = db.query(Setting).filter(Setting.key == "api_key").first()
        if s and s.value:
            key = decrypt(s.value)
            if key and len(key) > 10:
                return key
    except Exception:
        pass
    finally:
        db.close()
    return ANTHROPIC_AUTH_TOKEN or ""


@router.post("")
def intent_search(req: IntentRequest):
    query = req.query.strip()
    if not query or len(query) < 2:
        raise HTTPException(status_code=400, detail="请输入更具体的学习意图")

    api_key = _get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key，请在设置中填入 DeepSeek Key")

    # Step 1: Generate educational content via LLM
    content_prompt = INTENT_CONTENT_PROMPT.format(query=query)

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": content_prompt}],
        "stream": False,
        "thinking": {"type": "disabled"},
    }

    resp = httpx.post(f"{ANTHROPIC_BASE_URL}/messages", headers=headers, json=body, timeout=120)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI 内容生成失败 (HTTP {resp.status_code})")

    data = resp.json()
    content = data["content"][0]["text"] if data.get("content") else ""
    if len(content) < 200:
        raise HTTPException(status_code=500, detail="AI 生成的内容不足，请重试或换一个主题")

    # Step 2: Create material
    title = query[:50] + ("..." if len(query) > 50 else "")
    db = SessionLocal()
    try:
        m = Material(title=title, content=content, format="text")
        db.add(m)
        db.flush()
        mid = m.id

        # Embed chunks
        chunks = chunk_text(content)
        embed_and_store(chunks, mid)

        # Step 3: Generate questions (sync, up to 5 initial)
        total_chunks = len(chunks)
        max_q = min(total_chunks * 3, 5)
        if max_q < 1:
            max_q = 3

        chunk_list = get_random_chunks(mid, n=min(max_q * 3, 20))
        chunk_ids = [c["metadata"].get("chunk_oid", "") for c in chunk_list]
        chunks_text = "\n\n---\n\n".join([c["content"][:500] for c in chunk_list])

        quiz_prompt = build_quiz_prompt(max_q, "extract", "medium", "single,multi", chunks_text, "")
        q_body = {
            "model": ANTHROPIC_MODEL,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": quiz_prompt}],
            "stream": False,
            "thinking": {"type": "disabled"},
        }
        q_resp = httpx.post(f"{ANTHROPIC_BASE_URL}/messages", headers=headers, json=q_body, timeout=90)

        if q_resp.status_code == 200:
            q_data = q_resp.json()
            q_text = q_data["content"][0]["text"] if q_data.get("content") else ""
            parsed = _parse_batch_quiz_json(q_text)
            if "questions" in parsed:
                for i, q in enumerate(parsed["questions"]):
                    chunk_id = chunk_ids[i % len(chunk_ids)] if chunk_ids else ""
                    question = Question(
                        material_id=mid,
                        chunk_id=chunk_id,
                        question=q["question"],
                        options=q["options"],
                        answer=q.get("answer", "") or ",".join(q.get("answers", [])),
                        explanation=q.get("explanation", ""),
                        tags=q.get("tags", []),
                    )
                    db.add(question)

        db.commit()
        return {"status": "ready", "material_id": mid, "title": title, "question_count": max_q}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")
    finally:
        db.close()
