import json
from typing import AsyncGenerator
from services.rag import get_random_chunks
from config import ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
import httpx
import asyncio
import time


def _build_prompt(count: int, mode: str, difficulty: str, question_type: str, chunks_text: str, tag: str = "") -> str:
    """根据用户配置构建出题 Prompt"""

    mode_instructions = {
        "extract": "题目必须严格基于材料原文内容，考察对材料事实和关键概念的准确记忆。题干可以直接引用或转述材料中的表述。",
        "expand": "题目应从材料出发但做知识拓展。可以考察概念之间的联系、实际应用场景的分析、与其他知识的对比。题干需要结合材料内容做延伸推理。",
    }

    difficulty_instructions = {
        "easy": "题目应该简单直白，考察材料中最核心、最明显的知识点。干扰项应该与正确答案有显著差异。",
        "medium": "题目难度适中，考察对概念的理解而非简单记忆。干扰项需要有一定的迷惑性，需要仔细思考才能区分。",
        "hard": "题目应该较难，考察跨段落的概念关联、深层理解和批判性思维。干扰项应非常接近正确答案，只有真正理解才能选对。",
    }

    # 处理 mixed 模式
    types = [t.strip() for t in question_type.split(",") if t.strip()]
    has_single = "single" in types
    has_multi = "multi" in types

    if has_single and has_multi:
        single_count = count // 2
        multi_count = count - single_count
        type_instruction = f"""生成两种题型混合：
- {single_count} 道单项选择题：4个选项（A/B/C/D），只有1个正确答案，JSON中 "answer": "B"
- {multi_count} 道多项选择题：5个选项（A/B/C/D/E），2-3个正确答案，JSON中 "answers": ["A", "C"]
题目顺序可以随机交错。"""
    elif has_multi:
        type_instruction = """全部生成多项选择题（有2个或3个正确答案）。
选项数量为5个（A/B/C/D/E），正确答案为2-3个。
JSON格式中answer字段改为answers数组，例如 "answers": ["A", "C"]。
options数组包含5个选项。"""
    else:
        type_instruction = """全部生成单项选择题。
选项数量为4个（A/B/C/D），只有1个正确答案。
JSON格式中answer字段为单个字母，例如 "answer": "B"。
options数组包含4个选项。"""

    tag_instruction = ""
    if tag:
        tag_instruction = f"\n- 【定向出题】所有题目必须围绕「{tag}」这个知识点，题目标签中必须包含此标签"

    return f"""你是一个专业的出题老师。基于以下学习材料，生成 {count} 道题目。

模式：{mode_instructions.get(mode, mode_instructions["extract"])}

难度：{difficulty_instructions.get(difficulty, difficulty_instructions["medium"])}

题型：{type_instruction}

额外要求：
- 每题提供解析，解释为什么正确答案是对的、错误答案为什么不对
- 给每道题打2-3个标签（知识点、难度等）
- 题目之间不要重复，覆盖材料的不同知识点
- 【重要】每个选项文本必须以字母+点号+空格开头，格式如"A. 选项内容"、"B. 选项内容"{tag_instruction}

输出严格的JSON数组（不要markdown代码块标记）。

学习材料：
{chunks_text}

请生成 {count} 道题目："""


async def generate_quiz_stream(
    material_id: int,
    count: int = 5,
    exclude_ids: list = None,
    mode: str = "extract",
    difficulty: str = "medium",
    question_type: str = "single",
    tag: str = "",
    api_key: str = "",
) -> AsyncGenerator[str, None]:
    """批量生成题目，只发心跳信号，生成完毕后一次性返回所有题目"""
    chunks = get_random_chunks(material_id, n=min(count * 3, 20), exclude_ids=exclude_ids)
    chunk_ids = [c["metadata"].get("chunk_oid", "") for c in chunks]
    chunks_text = "\n\n---\n\n".join([c["content"][:500] for c in chunks])

    if not chunks_text.strip():
        yield f"data: {json.dumps({'error': '材料内容不足，请上传更多内容后再试'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    prompt = _build_prompt(count, mode, difficulty, question_type, chunks_text, tag)

    auth_token = api_key or ANTHROPIC_AUTH_TOKEN
    if not auth_token:
        yield f"data: {json.dumps({'error': '未配置 API Key，请在设置中填入 DeepSeek Key'})}\n\n"
        yield "data: [DONE]\n\n"
        return
    headers = {
        "x-api-key": auth_token,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "thinking": {"type": "disabled"},
    }

    full_text = ""
    in_text_block = False
    last_heartbeat = time.time()

    async with httpx.AsyncClient(timeout=90) as client:
        async with client.stream("POST", f"{ANTHROPIC_BASE_URL}/messages", headers=headers, json=body) as resp:
            if resp.status_code != 200:
                error_text = await resp.aread()
                yield f"data: {json.dumps({'error': f'AI 服务异常 (HTTP {resp.status_code})，请稍后重试'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            try:
                async for line in resp.aiter_lines():
                                # 每 3 秒发一次心跳，让前端知道还在出题
                    now = time.time()
                    if now - last_heartbeat > 3:
                        yield f"data: {json.dumps({'type': 'progress'})}\n\n"
                        last_heartbeat = now

                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            continue
                        try:
                            data = json.loads(data_str)
                            event_type = data.get("type")

                            if event_type == "content_block_start":
                                block_type = data.get("content_block", {}).get("type", "")
                                if block_type == "text":
                                    in_text_block = True

                            elif event_type == "content_block_stop":
                                in_text_block = False

                            elif event_type == "content_block_delta":
                                delta = data.get("delta", {})
                                delta_type = delta.get("type", "")

                                if delta_type == "text_delta":
                                    full_text += delta.get("text", "")

                            elif event_type == "message_stop":
                                parsed = _parse_batch_quiz_json(full_text)
                                parsed["chunk_ids"] = chunk_ids
                                yield f"data: {json.dumps({'complete': parsed, 'type': 'complete'})}\n\n"
                        except json.JSONDecodeError:
                            continue
            except asyncio.TimeoutError:
                if full_text:
                    parsed = _parse_batch_quiz_json(full_text)
                    parsed["chunk_ids"] = chunk_ids
                    yield f"data: {json.dumps({'complete': parsed, 'type': 'complete'})}\n\n"
                else:
                    yield f"data: {json.dumps({'error': 'AI 响应超时，请稍后重试'})}\n\n"

    yield "data: [DONE]\n\n"


def generate_quiz_sync(material_id: int, count: int, exclude_ids: list = None, mode: str = "extract", difficulty: str = "medium", question_type: str = "single", tag: str = "", api_key: str = ""):
    """同步出题，用于后台异步任务。非流式调用，返回题目列表"""
    chunks = get_random_chunks(material_id, n=min(count * 3, 20), exclude_ids=exclude_ids or [])
    chunk_ids = [c["metadata"].get("chunk_oid", "") for c in chunks]
    chunks_text = "\n\n---\n\n".join([c["content"][:500] for c in chunks])

    if not chunks_text.strip():
        return {"questions": [], "chunk_ids": []}

    prompt = _build_prompt(count, mode, difficulty, question_type, chunks_text, tag)
    auth_token = api_key or ANTHROPIC_AUTH_TOKEN
    if not auth_token:
        return {"questions": [], "chunk_ids": [], "error": "未配置 API Key，请在设置中填入 DeepSeek Key"}

    headers = {
        "x-api-key": auth_token,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "thinking": {"type": "disabled"},
    }

    resp = httpx.post(f"{ANTHROPIC_BASE_URL}/messages", headers=headers, json=body, timeout=90)
    if resp.status_code != 200:
        return {"questions": [], "chunk_ids": [], "error": f"HTTP {resp.status_code}"}

    data = resp.json()
    full_text = data["content"][0]["text"] if data.get("content") else ""
    parsed = _parse_batch_quiz_json(full_text)
    parsed["chunk_ids"] = chunk_ids
    return parsed


def _parse_batch_quiz_json(text: str) -> dict:
    """解析 LLM 输出的 JSON，处理 markdown 代码块包裹"""
    try:
        cleaned = text.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0]
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0]
        parsed = json.loads(cleaned.strip())
        # 兼容数组和单个对象两种格式
        if isinstance(parsed, list):
            return {"questions": parsed}
        elif isinstance(parsed, dict) and "question" in parsed:
            return {"questions": [parsed]}
        else:
            return {"questions": parsed if isinstance(parsed, list) else []}
    except (json.JSONDecodeError, IndexError, AttributeError):
        return {"error": "AI 返回格式异常，请重试", "raw": text[:300]}
