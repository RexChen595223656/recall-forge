# 知锻(RecallForge)增强版 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack generative learning tool with RAG knowledge base, AI question generation (SSE streaming), and SM-2 spaced repetition review.

**Architecture:** Next.js 14 frontend (App Router, TypeScript, Tailwind CSS) on Vercel + Python FastAPI backend (ChromaDB, SQLite, DeepSeek API) on Railway. Frontend communicates with backend via REST/SSE.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Python 3.11+, FastAPI, ChromaDB, SQLAlchemy, DeepSeek API (Anthropic-compatible endpoint), SSE

---

## Phase 1: Backend Foundation

### Task 1: Backend project setup

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/config.py`
- Create: `backend/models/database.py`
- Create: `backend/models/schemas.py`

- [ ] **Step 1: Write requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.6
chromadb==0.5.5
sqlalchemy==2.0.35
pydantic==2.9.2
httpx==0.27.2
PyPDF2==3.0.1
beautifulsoup4==4.12.3
markdown==3.7
python-multipart==0.0.12
text-embedding-3-small==0.1.0
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/backend && pip install -r requirements.txt
```

- [ ] **Step 3: Write config.py**

```python
import os

ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.deepseek.com/anthropic")
ANTHROPIC_AUTH_TOKEN = os.getenv("ANTHROPIC_AUTH_TOKEN", "sk-8a16f7bf475c49a88753a3eaac51cb85")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "deepseek-v4-pro")

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "data", "chroma")
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "quiz.db")
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50
MAX_FILE_SIZE_MB = 10
DAILY_QUESTION_LIMIT = 200
```

- [ ] **Step 4: Write models/database.py**

```python
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from config import SQLITE_DB_PATH
import os

os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)

engine = create_engine(f"sqlite:///{SQLITE_DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500))
    content = Column(Text)
    format = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    material_id = Column(Integer, ForeignKey("materials.id"))
    chunk_id = Column(String(200))
    question = Column(Text)
    options = Column(JSON)
    answer = Column(String(1))
    explanation = Column(Text)
    tags = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String(1))
    is_correct = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReviewCard(Base):
    __tablename__ = "review_cards"
    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    ease_factor = Column(Float, default=2.5)
    interval_days = Column(Integer, default=1)
    repetitions = Column(Integer, default=0)
    next_review = Column(DateTime, default=datetime.utcnow)
    last_review = Column(DateTime, nullable=True)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: Write models/schemas.py**

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MaterialCreate(BaseModel):
    title: str
    content: str
    format: str = "text"

class MaterialResponse(BaseModel):
    id: int
    title: str
    format: str
    created_at: datetime

class QuizGenerateRequest(BaseModel):
    material_id: int
    count: int = 5

class QuizSubmitRequest(BaseModel):
    question_id: int
    user_answer: str

class QuizSubmitResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: str

class ReviewRecordRequest(BaseModel):
    question_id: int
    score: int  # 0=完全忘记, 1=记得但困难, 2=记得, 3=轻松

class StatsResponse(BaseModel):
    total_questions: int
    total_attempts: int
    accuracy: float
    due_reviews: int
    streak_days: int
```

- [ ] **Step 6: Write main.py skeleton**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import materials, quiz, review, stats

app = FastAPI(title="AI Horse Quiz API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materials.router, prefix="/api/materials", tags=["materials"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["quiz"])
app.include_router(review.router, prefix="/api/review", tags=["review"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])

@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Create routers/__init__.py and services/__init__.py**

```bash
touch /Users/chenbaijian/my-claude/recall-forge/backend/routers/__init__.py
touch /Users/chenbaijian/my-claude/recall-forge/backend/services/__init__.py
mkdir -p /Users/chenbaijian/my-claude/recall-forge/backend/data
```

- [ ] **Step 8: Verify server starts**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/backend && python3 -m uvicorn main:app --port 8000 &
sleep 3 && curl http://localhost:8000/api/health && kill %1
```

Expected: `{"status":"ok"}`

---

### Task 2: RAG service — chunking + ChromaDB

**Files:**
- Create: `backend/services/rag.py`
- Modify: `backend/config.py` (add embedding config)

- [ ] **Step 1: Write services/rag.py**

```python
import chromadb
from chromadb.config import Settings
from config import CHROMA_PERSIST_DIR, CHUNK_SIZE, CHUNK_OVERLAP
import hashlib
import re

chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
collection = chroma_client.get_or_create_collection(name="materials")

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[dict]:
    """Split text into overlapping chunks. Returns list of {id, content, index}."""
    paragraphs = re.split(r'\n{2,}', text)
    chunks = []
    idx = 0
    for para in paragraphs:
        para = para.strip()
        if not para or len(para) < 20:
            continue
        if len(para) <= chunk_size:
            chunk_id = hashlib.md5(para.encode()).hexdigest()[:12]
            chunks.append({"id": chunk_id, "content": para, "index": idx})
            idx += 1
        else:
            # Sliding window for long paragraphs
            start = 0
            while start < len(para):
                end = min(start + chunk_size, len(para))
                seg = para[start:end].strip()
                if len(seg) >= 20:
                    chunk_id = hashlib.md5(seg.encode()).hexdigest()[:12]
                    chunks.append({"id": chunk_id, "content": seg, "index": idx})
                    idx += 1
                start += chunk_size - overlap
    return chunks

def embed_and_store(chunks: list[dict], material_id: int):
    """Embed chunks with simple TF-IDF-like approach and store in ChromaDB.
    Uses ChromaDB's built-in embedding function for simplicity."""
    texts = [c["content"] for c in chunks]
    ids = [f"m{material_id}_{c['id']}" for c in chunks]
    metadatas = [{"material_id": material_id, "chunk_index": c["index"], "chunk_oid": c["id"]} for c in chunks]

    # Delete existing chunks for this material if re-uploading
    existing = collection.get(where={"material_id": material_id})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])

    if texts:
        collection.add(
            documents=texts,
            ids=ids,
            metadatas=metadatas
        )

def retrieve_chunks(query: str, n_results: int = 5, material_id: int = None) -> list[dict]:
    """Retrieve relevant chunks from ChromaDB."""
    where_filter = {"material_id": material_id} if material_id else None
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where=where_filter
    )
    chunks = []
    if results and results["documents"] and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            chunks.append({"content": doc, "metadata": meta})
    return chunks

def get_random_chunks(material_id: int, n: int = 5) -> list[dict]:
    """Get random chunks from a material for initial question generation."""
    results = collection.get(
        where={"material_id": material_id},
        limit=n
    )
    chunks = []
    if results and results["documents"]:
        for i, doc in enumerate(results["documents"]):
            meta = results["metadatas"][i] if results["metadatas"] else {}
            chunks.append({"content": doc, "metadata": meta})
    return chunks

def delete_material_chunks(material_id: int):
    """Remove all chunks for a material."""
    existing = collection.get(where={"material_id": material_id})
    if existing and existing["ids"]:
        collection.delete(ids=existing["ids"])
```

- [ ] **Step 2: Test chunking logic**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/backend && python3 -c "
from services.rag import chunk_text
text = '第一段内容。\n\n第二段内容很长' + '测试'*100
chunks = chunk_text(text)
print(f'Chunks: {len(chunks)}')
for c in chunks:
    print(f'  [{c[\"id\"]}] {c[\"content\"][:50]}...')
"
```

---

### Task 3: Materials API (upload + list + delete)

**Files:**
- Create: `backend/routers/materials.py`
- Create: `backend/services/parser.py`

- [ ] **Step 1: Write services/parser.py**

```python
import re
from urllib.parse import urlparse
import httpx

async def parse_url(url: str) -> str:
    """Fetch and extract text content from URL."""
    from bs4 import BeautifulSoup
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n\n".join(lines)

def parse_pdf(file_bytes: bytes, filename: str) -> str:
    """Extract text from PDF bytes."""
    from PyPDF2 import PdfReader
    import io
    reader = PdfReader(io.BytesIO(file_bytes))
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t)
    return "\n\n".join(texts)

def parse_markdown(content: str) -> str:
    """Strip markdown formatting, return plain text."""
    # Remove code blocks, images, links - keep text
    content = re.sub(r'```[\s\S]*?```', '', content)
    content = re.sub(r'!\[.*?\]\(.*?\)', '', content)
    content = re.sub(r'\[([^\]]+)\]\(.*?\)', r'\1', content)
    content = re.sub(r'[#*>`|_~-]', '', content)
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    return "\n\n".join(lines)
```

- [ ] **Step 2: Write routers/materials.py**

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from models.database import get_db, Material
from models.schemas import MaterialCreate, MaterialResponse
from services.rag import chunk_text, embed_and_store, delete_material_chunks
from services.parser import parse_url, parse_pdf, parse_markdown
from config import MAX_FILE_SIZE_MB

router = APIRouter()

@router.post("", response_model=MaterialResponse)
async def create_material(
    title: str = Form(...),
    content: str = Form(None),
    url: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    text = ""

    if url:
        try:
            text = await parse_url(url)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"URL 解析失败: {str(e)}")
    elif file:
        if file.size and file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"文件超过 {MAX_FILE_SIZE_MB}MB 限制")
        raw = await file.read()
        if file.filename.endswith('.pdf'):
            text = parse_pdf(raw, file.filename)
        elif file.filename.endswith('.md'):
            text = parse_markdown(raw.decode('utf-8'))
        else:
            text = raw.decode('utf-8')
    elif content:
        text = content
    else:
        raise HTTPException(status_code=400, detail="请提供材料内容、URL 或文件")

    if len(text) < 50:
        raise HTTPException(status_code=400, detail="材料内容过短（需至少50字）")

    material = Material(title=title, content=text, format=url and "url" or (file.filename if file else "text"))
    db.add(material)
    db.commit()
    db.refresh(material)

    chunks = chunk_text(text)
    embed_and_store(chunks, material.id)

    return MaterialResponse(id=material.id, title=material.title, format=material.format, created_at=material.created_at)

@router.get("", response_model=list[MaterialResponse])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).order_by(Material.created_at.desc()).all()

@router.delete("/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")
    delete_material_chunks(material_id)
    db.delete(material)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Test upload endpoint**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/backend
# Start server in background
python3 -m uvicorn main:app --port 8000 &
sleep 2

# Test text upload
curl -X POST http://localhost:8000/api/materials \
  -F "title=测试材料" \
  -F "content=人工智能产品经理是当今最热门的职业之一。AI PM需要理解大语言模型的能力边界，同时具备传统产品经理的需求分析能力。RAG架构是当前AI产品最常见的模式之一。" \
  | python3 -m json.tool

kill %1 2>/dev/null
```

---

### Task 4: Quiz generation + SSE streaming

**Files:**
- Create: `backend/routers/quiz.py`
- Create: `backend/services/quiz_gen.py`

- [ ] **Step 1: Write services/quiz_gen.py**

```python
import json
import asyncio
from typing import AsyncGenerator
from services.rag import get_random_chunks
from config import ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
import httpx

QUIZ_PROMPT = """你是一个专业的出题老师。基于以下学习材料，生成一道单项选择题。

要求：
1. 题干必须基于材料内容，不能凭空编造
2. 4个选项（A/B/C/D），只有1个正确答案
3. 干扰项要有迷惑性，但不能明显错误
4. 提供解析，解释为什么正确答案是对的
5. 给题目打2-3个标签（知识点、难度等）

输出严格的JSON格式：
{
  "question": "题干内容",
  "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
  "answer": "A",
  "explanation": "解析内容",
  "tags": ["标签1", "标签2"]
}

学习材料：
{chunks}

请基于以上材料生成题目："""

async def generate_quiz_stream(material_id: int, count: int = 1) -> AsyncGenerator[str, None]:
    """Generate quiz questions with SSE streaming."""
    chunks = get_random_chunks(material_id, n=min(count * 3, 10))
    chunks_text = "\n\n---\n\n".join([c["content"][:500] for c in chunks])

    if not chunks_text.strip():
        yield f"data: {json.dumps({'error': '材料内容不足，无法生成题目'})}\\n\\n"
        yield "data: [DONE]\\n\\n"
        return

    prompt = QUIZ_PROMPT.format(chunks=chunks_text)

    headers = {
        "x-api-key": ANTHROPIC_AUTH_TOKEN,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }

    full_text = ""

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST", f"{ANTHROPIC_BASE_URL}/messages", headers=headers, json=body) as resp:
            if resp.status_code != 200:
                error_text = await resp.aread()
                yield f"data: {json.dumps({'error': f'API 错误: {resp.status_code}'})}\\n\\n"
                yield "data: [DONE]\\n\\n"
                return

            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        continue
                    try:
                        data = json.loads(data_str)
                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {}).get("text", "")
                            full_text += delta
                            yield f"data: {json.dumps({'delta': delta, 'type': 'delta'})}\\n\\n"
                        elif data.get("type") == "message_stop":
                            parsed = _parse_quiz_json(full_text)
                            yield f"data: {json.dumps({'complete': parsed, 'type': 'complete'})}\\n\\n"
                    except json.JSONDecodeError:
                        continue

    yield "data: [DONE]\\n\\n"

def _parse_quiz_json(text: str) -> dict:
    """Extract JSON from LLM output."""
    try:
        match = text.strip()
        # Try to find JSON block
        if "```json" in match:
            match = match.split("```json")[1].split("```")[0]
        elif "```" in match:
            match = match.split("```")[1].split("```")[0]
        return json.loads(match.strip())
    except (json.JSONDecodeError, IndexError):
        return {"error": "JSON 解析失败", "raw": text[:200]}
```

- [ ] **Step 2: Write routers/quiz.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from models.database import get_db, Question, Attempt, Material
from models.schemas import QuizGenerateRequest, QuizSubmitRequest, QuizSubmitResponse
from services.quiz_gen import generate_quiz_stream
from datetime import datetime

router = APIRouter()

@router.post("/generate")
async def generate_quiz(req: QuizGenerateRequest):
    material_id = req.material_id
    return StreamingResponse(
        generate_quiz_stream(material_id, req.count),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.post("/submit", response_model=QuizSubmitResponse)
def submit_answer(req: QuizSubmitRequest, db: Session = Depends(get_db)):
    question = db.query(Question).filter(Question.id == req.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    is_correct = req.user_answer.upper() == question.answer.upper()

    attempt = Attempt(
        question_id=req.question_id,
        user_answer=req.user_answer,
        is_correct=1 if is_correct else 0
    )
    db.add(attempt)
    db.commit()

    return QuizSubmitResponse(
        is_correct=is_correct,
        correct_answer=question.answer,
        explanation=question.explanation or ""
    )

@router.post("/save")
def save_question(data: dict, db: Session = Depends(get_db)):
    """Save a generated question to the database."""
    question = Question(
        material_id=data.get("material_id"),
        chunk_id=data.get("chunk_id", ""),
        question=data["question"],
        options=data["options"],
        answer=data["answer"],
        explanation=data.get("explanation", ""),
        tags=data.get("tags", [])
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return {"id": question.id}
```

- [ ] **Step 4: Test quiz generation**

```bash
# Start server in background
cd /Users/chenbaijian/my-claude/recall-forge/backend && python3 -m uvicorn main:app --port 8000 &
sleep 2

# Test SSE stream
curl -N -X POST http://localhost:8000/api/quiz/generate \
  -H "Content-Type: application/json" \
  -d '{"material_id": 1, "count": 1}'

kill %1 2>/dev/null
```

---

### Task 5: SM-2 review service + API

**Files:**
- Create: `backend/services/sm2.py`
- Create: `backend/routers/review.py`

- [ ] **Step 1: Write services/sm2.py**

```python
from datetime import datetime, timedelta

def calculate_sm2(score: int, ease_factor: float = 2.5, interval_days: int = 1, repetitions: int = 0) -> dict:
    """
    SM-2 algorithm implementation.
    score: 0=黑out(完全忘记), 1=红(记得但困难), 2=绿(记得), 3=蓝(轻松)
    Returns updated ease_factor, interval, repetitions, next_review
    """
    if score < 0 or score > 3:
        raise ValueError("Score must be 0-3")

    if score < 2:
        # Failed: reset
        new_repetitions = 0
        new_interval = 1
        new_ease = max(1.3, ease_factor - 0.2)
    else:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 3
        else:
            new_interval = round(interval_days * ease_factor)

        new_repetitions = repetitions + 1
        new_ease = ease_factor + (0.1 - (3 - score) * (0.08 + (3 - score) * 0.02))

    new_ease = max(1.3, min(2.5, new_ease))
    next_review = datetime.utcnow() + timedelta(days=new_interval)

    return {
        "ease_factor": round(new_ease, 2),
        "interval_days": new_interval,
        "repetitions": new_repetitions,
        "next_review": next_review
    }
```

- [ ] **Step 2: Write routers/review.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db, ReviewCard, Question, Attempt
from models.schemas import ReviewRecordRequest
from services.sm2 import calculate_sm2
from datetime import datetime
import random

router = APIRouter()

@router.get("/due")
def get_due_reviews(material_id: int = None, limit: int = 10, db: Session = Depends(get_db)):
    """Get questions due for review."""
    query = db.query(ReviewCard).filter(ReviewCard.next_review <= datetime.utcnow())
    if material_id:
        query = query.join(Question).filter(Question.material_id == material_id)
    cards = query.order_by(ReviewCard.next_review.asc()).limit(limit).all()

    results = []
    for card in cards:
        question = db.query(Question).filter(Question.id == card.question_id).first()
        if question:
            results.append({
                "review_id": card.id,
                "question_id": question.id,
                "question": question.question,
                "options": question.options,
                "answer": question.answer,
                "explanation": question.explanation,
                "tags": question.tags,
                "ease_factor": card.ease_factor,
                "interval_days": card.interval_days,
                "repetitions": card.repetitions,
            })
    return results

@router.post("/record")
def record_review(req: ReviewRecordRequest, db: Session = Depends(get_db)):
    """Record a review result and update SM-2 schedule."""
    card = db.query(ReviewCard).filter(ReviewCard.question_id == req.question_id).first()

    if not card:
        card = ReviewCard(question_id=req.question_id)
        db.add(card)
        db.flush()

    result = calculate_sm2(req.score, card.ease_factor, card.interval_days, card.repetitions)
    card.ease_factor = result["ease_factor"]
    card.interval_days = result["interval_days"]
    card.repetitions = result["repetitions"]
    card.next_review = result["next_review"]
    card.last_review = datetime.utcnow()
    db.commit()

    return {
        "ok": True,
        "next_review": result["next_review"].isoformat(),
        "interval_days": result["interval_days"]
    }

@router.post("/enroll/{question_id}")
def enroll_question(question_id: int, db: Session = Depends(get_db)):
    """Add a question to the review system (call after getting it wrong)."""
    existing = db.query(ReviewCard).filter(ReviewCard.question_id == question_id).first()
    if existing:
        return {"ok": True, "message": "已在复习计划中"}

    card = ReviewCard(question_id=question_id)
    db.add(card)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Test SM-2 logic**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/backend && python3 -c "
from services.sm2 import calculate_sm2
# Test: correct answer with score 3
r = calculate_sm2(3, 2.5, 1, 0)
print(f'Score 3 -> interval: {r[\"interval_days\"]}d, ease: {r[\"ease_factor\"]}, reps: {r[\"repetitions\"]}')
# Test: wrong answer
r2 = calculate_sm2(0, 2.5, 10, 3)
print(f'Score 0 -> interval: {r2[\"interval_days\"]}d, ease: {r2[\"ease_factor\"]}, reps: {r2[\"repetitions\"]}')
"
```

---

### Task 6: Statistics API

**Files:**
- Create: `backend/routers/stats.py`

- [ ] **Step 1: Write routers/stats.py**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.database import get_db, Question, Attempt, ReviewCard, Material
from datetime import datetime, timedelta

router = APIRouter()

@router.get("")
def get_stats(db: Session = Depends(get_db)):
    total_questions = db.query(Question).count()
    total_attempts = db.query(Attempt).count()
    correct_attempts = db.query(Attempt).filter(Attempt.is_correct == 1).count()
    accuracy = round(correct_attempts / total_attempts * 100, 1) if total_attempts > 0 else 0
    due_reviews = db.query(ReviewCard).filter(ReviewCard.next_review <= datetime.utcnow()).count()

    # Streak: count consecutive days with attempts
    streak = 0
    today = datetime.utcnow().date()
    for i in range(365):
        day = today - timedelta(days=i)
        has_attempts = db.query(Attempt).filter(
            func.date(Attempt.created_at) == day.isoformat()
        ).first() is not None
        if has_attempts:
            streak += 1
        else:
            if i > 0:
                break

    total_materials = db.query(Material).count()

    # Tag distribution
    questions = db.query(Question).all()
    tag_counts = {}
    for q in questions:
        if q.tags:
            for tag in q.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    return {
        "total_questions": total_questions,
        "total_attempts": total_attempts,
        "total_materials": total_materials,
        "accuracy": accuracy,
        "due_reviews": due_reviews,
        "streak_days": streak,
        "tag_distribution": tag_counts,
    }
```

---

## Phase 2: Frontend

### Task 7: Next.js project setup + theme

**Files:**
- Create: `frontend/` (via npx create-next-app)
- Modify: `frontend/tailwind.config.ts`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create Next.js project**

```bash
cd /Users/chenbaijian/my-claude/recall-forge && npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

- [ ] **Step 2: Configure Tailwind with dark theme**

Write to `tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#00e599",
          soft: "rgba(0, 229, 153, 0.08)",
          blue: "#10b981",
        },
        surface: {
          primary: "#000000",
          secondary: "rgba(9, 9, 11, 0.88)",
          panel: "rgba(255, 255, 255, 0.02)",
          "panel-strong": "rgba(255, 255, 255, 0.03)",
        },
        border: {
          soft: "rgba(255, 255, 255, 0.08)",
          strong: "#27272a",
        },
        text: {
          primary: "#fafafa",
          secondary: "#a1a1aa",
          muted: "#888888",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: Write global CSS**

Replace `frontend/src/app/globals.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #000000;
  --accent: #00e599;
}

body {
  background: var(--bg-primary);
  color: #fafafa;
  font-family: "Inter", "Noto Sans SC", sans-serif;
}

@layer utilities {
  .glass-panel {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    backdrop-filter: blur(12px);
  }
  .glow-border {
    box-shadow: 0 0 0 1px rgba(0, 229, 153, 0.045), 0 0 22px rgba(0, 229, 153, 0.06);
  }
}
```

- [ ] **Step 4: Create API client**

Write `frontend/src/lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface Material {
  id: number;
  title: string;
  format: string;
  created_at: string;
}

export interface Stats {
  total_questions: number;
  total_attempts: number;
  total_materials: number;
  accuracy: number;
  due_reviews: number;
  streak_days: number;
  tag_distribution: Record<string, number>;
}

export interface ReviewItem {
  review_id: number;
  question_id: number;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}

export async function uploadMaterial(title: string, content?: string, url?: string, file?: File): Promise<Material> {
  const formData = new FormData();
  formData.append("title", title);
  if (content) formData.append("content", content);
  if (url) formData.append("url", url);
  if (file) formData.append("file", file);

  const res = await fetch(`${API_BASE}/materials`, { method: "POST", body: formData });
  if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
  return res.json();
}

export async function listMaterials(): Promise<Material[]> {
  const res = await fetch(`${API_BASE}/materials`);
  return res.json();
}

export async function deleteMaterial(id: number): Promise<void> {
  await fetch(`${API_BASE}/materials/${id}`, { method: "DELETE" });
}

export function generateQuizStream(
  materialId: number,
  count: number,
  onDelta: (delta: string) => void,
  onComplete: (data: any) => void,
  onError: (error: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/quiz/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ material_id: materialId, count }),
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") return;
          try {
            const data = JSON.parse(dataStr);
            if (data.type === "delta") onDelta(data.delta);
            else if (data.type === "complete") onComplete(data.complete);
            else if (data.error) onError(data.error);
          } catch {}
        }
      }
    }
  }).catch((e) => {
    if (e.name !== "AbortError") onError(e.message);
  });

  return controller;
}

export async function submitAnswer(questionId: number, userAnswer: string): Promise<{ is_correct: boolean; correct_answer: string; explanation: string }> {
  const res = await fetch(`${API_BASE}/quiz/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, user_answer: userAnswer }),
  });
  return res.json();
}

export async function saveQuestion(data: Record<string, any>): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/quiz/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getDueReviews(materialId?: number): Promise<ReviewItem[]> {
  const params = materialId ? `?material_id=${materialId}` : "";
  const res = await fetch(`${API_BASE}/review/due${params}`);
  return res.json();
}

export async function recordReview(questionId: number, score: number): Promise<any> {
  const res = await fetch(`${API_BASE}/review/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, score }),
  });
  return res.json();
}

export async function enrollQuestion(questionId: number): Promise<any> {
  const res = await fetch(`${API_BASE}/review/enroll/${questionId}`, { method: "POST" });
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}
```

- [ ] **Step 5: Verify frontend starts**

```bash
cd /Users/chenbaijian/my-claude/recall-forge/frontend && npm run dev &
sleep 5 && curl -s http://localhost:3000 | head -20 && kill %1 2>/dev/null
```

---

### Task 8: Dashboard page (home)

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/components/StatsCard.tsx`

- [ ] **Step 1: Write StatsCard component**

```tsx
// frontend/src/components/StatsCard.tsx
export function StatsCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-panel p-4 flex flex-col gap-1">
      <span className="text-text-muted text-sm">{label}</span>
      <span className="text-2xl font-bold text-brand">{value}</span>
      {sub && <span className="text-text-muted text-xs">{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Write dashboard page**

```tsx
// frontend/src/app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getStats, listMaterials, type Stats, type Material } from "@/lib/api";
import { StatsCard } from "@/components/StatsCard";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), listMaterials()]).then(([s, m]) => {
      setStats(s);
      setMaterials(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          知锻 RecallForge
        </h1>
        <p className="text-text-secondary">材料驱动 · 生成式学习 · 科学复习</p>
      </header>

      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <StatsCard label="题库总量" value={stats.total_questions} />
          <StatsCard label="答题次数" value={stats.total_attempts} />
          <StatsCard label="正确率" value={`${stats.accuracy}%`} />
          <StatsCard label="待复习" value={stats.due_reviews} />
          <StatsCard label="连续天数" value={stats.streak_days} />
        </section>
      )}

      <section className="flex gap-4 mb-8">
        <Link href="/upload" className="glass-panel px-6 py-3 text-brand hover:bg-brand-soft transition-colors">
          + 上传新材料
        </Link>
        <Link href="/review" className="glass-panel px-6 py-3 text-text-secondary hover:bg-white/5 transition-colors">
          复习中心 {stats && stats.due_reviews > 0 && <span className="text-brand ml-1">({stats.due_reviews})</span>}
        </Link>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">知识库</h2>
        {materials.length === 0 ? (
          <div className="glass-panel p-8 text-center text-text-muted">
            知识库为空，上传你的第一份学习材料开始刷题
          </div>
        ) : (
          <div className="grid gap-3">
            {materials.map((m) => (
              <Link key={m.id} href={`/quiz/${m.id}`} className="glass-panel p-4 flex justify-between items-center hover:bg-white/5 transition-colors">
                <div>
                  <div className="font-medium">{m.title}</div>
                  <div className="text-sm text-text-muted">{m.format} · {new Date(m.created_at).toLocaleDateString("zh-CN")}</div>
                </div>
                <span className="text-brand text-sm">开始刷题 →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
```

---

### Task 9: Upload page

**Files:**
- Create: `frontend/src/app/upload/page.tsx`

- [ ] **Step 1: Write upload page**

```tsx
// frontend/src/app/upload/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMaterial } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"text" | "url" | "file">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("请输入材料标题"); return; }
    setUploading(true);
    setError("");
    try {
      const result = await uploadMaterial(title, content || undefined, url || undefined, file || undefined);
      router.push(`/quiz/${result.id}`);
    } catch (err: any) {
      setError(err.message || "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">上传学习材料</h1>

      <div className="flex gap-2 mb-6">
        {(["text", "url", "file"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              mode === m ? "bg-brand text-black font-medium" : "bg-surface-panel text-text-secondary"
            }`}
          >
            {{ text: "文本输入", url: "网页链接", file: "文件上传" }[m]}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="材料标题（如：AI PM 工作方法论）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
        />

        {mode === "text" && (
          <textarea
            placeholder="粘贴或输入学习材料内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none resize-y"
          />
        )}

        {mode === "url" && (
          <input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        )}

        {mode === "file" && (
          <div className="glass-panel p-8 text-center">
            <input
              type="file"
              accept=".pdf,.md,.txt,.html"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-text-secondary"
            />
            <p className="text-text-muted text-sm mt-2">支持 PDF / Markdown / TXT / HTML，最大 10MB</p>
          </div>
        )}

        {error && <div className="text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg">{error}</div>}

        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-brand text-black font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {uploading ? "上传处理中..." : "上传并开始刷题"}
        </button>
      </form>
    </main>
  );
}
```

---

### Task 10: Quiz page (core experience)

**Files:**
- Create: `frontend/src/app/quiz/[id]/page.tsx`
- Create: `frontend/src/components/QuizStream.tsx`

- [ ] **Step 1: Write QuizStream component**

```tsx
// frontend/src/components/QuizStream.tsx
"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { generateQuizStream, saveQuestion, submitAnswer, enrollQuestion } from "@/lib/api";

interface QuestionData {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
}

type Phase = "loading" | "streaming" | "answering" | "feedback" | "complete";

export function QuizStream({ materialId, onDone }: { materialId: number; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [streamText, setStreamText] = useState("");
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ is_correct: boolean; explanation: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const startQuiz = useCallback(() => {
    setPhase("loading");
    setStreamText("");
    setQuestionData(null);
    setSelectedAnswer(null);
    setFeedback(null);
    mountedRef.current = true;

    const controller = generateQuizStream(
      materialId, 1,
      (delta) => {
        if (mountedRef.current) {
          setStreamText((prev) => prev + delta);
          setPhase("streaming");
        }
      },
      async (data) => {
        if (!mountedRef.current) return;
        if (data.error) {
          setPhase("complete");
          return;
        }
        const qd: QuestionData = {
          question: data.question || "",
          options: data.options || [],
          answer: data.answer || "",
          explanation: data.explanation || "",
          tags: data.tags || [],
        };
        setQuestionData(qd);

        try {
          const saved = await saveQuestion({
            material_id: materialId,
            question: qd.question,
            options: qd.options,
            answer: qd.answer,
            explanation: qd.explanation,
            tags: qd.tags,
          });
          setQuestionId(saved.id);
        } catch {}

        setPhase("answering");
      },
      (error) => {
        if (mountedRef.current) {
          setStreamText(error);
          setPhase("complete");
        }
      }
    );
    controllerRef.current = controller;
  }, [materialId]);

  useEffect(() => {
    startQuiz();
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, [startQuiz]);

  async function handleAnswer(option: string) {
    if (phase !== "answering" || !questionData || !questionId) return;
    setSelectedAnswer(option);

    try {
      const result = await submitAnswer(questionId, option[0]);
      setFeedback({ is_correct: result.is_correct, explanation: result.explanation });

      if (!result.is_correct) {
        await enrollQuestion(questionId);
      }

      setPhase("feedback");

      // Auto-advance after 1500ms
      setTimeout(() => {
        if (mountedRef.current) startQuiz();
      }, 1500);
    } catch {
      setPhase("feedback");
      setFeedback({ is_correct: option[0] === questionData.answer, explanation: questionData.explanation });
      setTimeout(() => {
        if (mountedRef.current) startQuiz();
      }, 1500);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {(phase === "loading" || phase === "streaming") && (
        <div className="glass-panel p-6 space-y-4">
          {phase === "loading" && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-4 bg-white/5 rounded w-full" />
              <div className="h-4 bg-white/5 rounded w-2/3" />
            </div>
          )}
          {phase === "streaming" && (
            <div className="space-y-4">
              <div className="text-lg leading-relaxed">
                {streamText || <span className="animate-pulse text-brand">▊</span>}
              </div>
              {!questionData && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <span className="inline-block w-2 h-2 bg-brand rounded-full animate-pulse" />
                  AI 正在出题...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "answering" && questionData && (
        <div className="glass-panel p-6 space-y-6">
          <p className="text-lg leading-relaxed">{questionData.question}</p>
          <div className="space-y-3">
            {questionData.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(opt)}
                disabled={!!selectedAnswer}
                className="w-full text-left px-4 py-3 rounded-lg border border-border-soft hover:border-brand hover:bg-brand-soft transition-all disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
          {questionData.tags.length > 0 && (
            <div className="flex gap-2">
              {questionData.tags.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-brand-soft text-brand">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === "feedback" && questionData && (
        <div className={`glass-panel p-6 space-y-4 ${feedback?.is_correct ? "border-green-500/30" : "border-red-500/30"}`}>
          <div className={`text-lg font-semibold ${feedback?.is_correct ? "text-green-400" : "text-red-400"}`}>
            {feedback?.is_correct ? "正确!" : "错误"}
          </div>
          <p className="text-text-secondary">{feedback?.explanation}</p>
          <p className="text-text-muted text-sm">下一题即将出现...</p>
        </div>
      )}

      {phase === "complete" && (
        <div className="glass-panel p-6 text-center space-y-4">
          <p className="text-text-secondary">题目生成完毕</p>
          <button onClick={onDone} className="px-6 py-2 bg-brand text-black rounded-lg font-medium">
            返回知识库
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write quiz page**

```tsx
// frontend/src/app/quiz/[id]/page.tsx
"use client";
import { useParams, useRouter } from "next/navigation";
import { QuizStream } from "@/components/QuizStream";

export default function QuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => router.push("/")} className="text-text-muted hover:text-text-secondary mb-6 inline-block">
        ← 返回知识库
      </button>
      <QuizStream materialId={parseInt(id)} onDone={() => router.push("/")} />
    </main>
  );
}
```

---

### Task 11: Review center page

**Files:**
- Create: `frontend/src/app/review/page.tsx`

- [ ] **Step 1: Write review page**

```tsx
// frontend/src/app/review/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getDueReviews, recordReview, type ReviewItem } from "@/lib/api";
import Link from "next/link";

const SCORE_LABELS = [
  { score: 0, label: "完全忘了", color: "bg-red-500/20 text-red-400 hover:bg-red-500/30" },
  { score: 1, label: "记得一点", color: "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" },
  { score: 2, label: "记得", color: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" },
  { score: 3, label: "很轻松", color: "bg-green-500/20 text-green-400 hover:bg-green-500/30" },
];

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDueReviews().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  async function handleScore(score: number) {
    if (!items[current]) return;
    await recordReview(items[current].question_id, score);
    setShowAnswer(false);

    if (current < items.length - 1) {
      setCurrent(current + 1);
    } else {
      setItems((prev) => prev.filter((_, i) => i !== current));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-text-muted">加载复习计划...</div>
      </div>
    );
  }

  if (items.length === 0 || current >= items.length) {
    return (
      <main className="min-h-screen max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="glass-panel p-12">
          <h1 className="text-2xl font-bold mb-4">复习完成</h1>
          <p className="text-text-secondary mb-6">当前没有需要复习的题目，继续保持！</p>
          <Link href="/" className="text-brand hover:underline">返回首页</Link>
        </div>
      </main>
    );
  }

  const item = items[current];

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">复习中心</h1>
        <span className="text-text-muted text-sm">{current + 1} / {items.length}</span>
      </div>

      <div className="glass-panel p-6 space-y-6">
        <p className="text-lg leading-relaxed">{item.question}</p>

        {!showAnswer ? (
          <button
            onClick={() => setShowAnswer(true)}
            className="w-full py-3 rounded-lg bg-brand-soft text-brand hover:bg-brand/20 transition-colors"
          >
            查看答案
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-surface-panel-strong">
              <p className="text-text-muted text-sm mb-1">正确答案</p>
              <p className="font-medium">{item.answer}. {item.options.find(o => o.startsWith(item.answer))}</p>
              {item.explanation && <p className="text-text-secondary text-sm mt-2">{item.explanation}</p>}
            </div>

            <p className="text-text-muted text-sm">你对这道题的掌握程度？</p>
            <div className="grid grid-cols-4 gap-2">
              {SCORE_LABELS.map(({ score, label, color }) => (
                <button
                  key={score}
                  onClick={() => handleScore(score)}
                  className={`py-3 rounded-lg text-sm font-medium transition-colors ${color}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-text-muted text-xs">
              <p>间隔: {item.interval_days}天 · 复习次数: {item.repetitions} · 难度系数: {item.ease_factor}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

---

## Phase 3: Integration & Polish

### Task 12: Layout + Navigation

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Update root layout**

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知锻(RecallForge) - AI驱动生成式学习",
  description: "材料上传 → AI出题 → 科学复习",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-surface-primary text-text-primary antialiased min-h-screen">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-surface-primary/80 backdrop-blur-md border-b border-border-soft">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="font-bold text-brand">知锻(RecallForge)</a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-text-secondary hover:text-text-primary">首页</a>
              <a href="/upload" className="text-text-secondary hover:text-text-primary">上传</a>
              <a href="/review" className="text-text-secondary hover:text-text-primary">复习</a>
            </div>
          </div>
        </nav>
        <div className="pt-14">{children}</div>
      </body>
    </html>
  );
}
```

---

### Task 13: Backend deployment prep

**Files:**
- Create: `backend/Procfile`
- Create: `backend/runtime.txt`

- [ ] **Step 1: Write Procfile**

```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

- [ ] **Step 2: Write runtime.txt**

```
python-3.11.0
```

- [ ] **Step 3: Write backend/README.md (deploy instructions)**

```md
# AI Horse Quiz Backend

## Local Dev
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000

## Deploy to Railway
1. Connect GitHub repo
2. Set root directory to `backend/`
3. Add env vars: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
4. Deploy
```

---

### Task 14: Final integration test

- [ ] **Step 1: Start both services**

```bash
# Terminal 1
cd /Users/chenbaijian/my-claude/recall-forge/backend && python3 -m uvicorn main:app --port 8000

# Terminal 2
cd /Users/chenbaijian/my-claude/recall-forge/frontend && NEXT_PUBLIC_API_URL=http://localhost:8000/api npm run dev
```

- [ ] **Step 2: Test full flow**

1. Open http://localhost:3000 — Dashboard loads
2. Click "上传新材料" — Upload page renders
3. Paste text material, submit — Redirects to quiz page
4. Quiz streams and renders — Options clickable
5. Submit answer — Feedback shown
6. Go to /review — Review items load
7. Complete review — SM-2 schedule updates

- [ ] **Step 3: Check backend health**

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/stats | python3 -m json.tool
```

---

## Post-Launch

### Task 15: Self-review & documentation

- [ ] Update `CLAUDE.md` with lessons learned
- [ ] Write F-08 evaluation report (model quality assessment)
- [ ] Write F-09 launch analysis
- [ ] Update global memory with project patterns
- [ ] Commit all changes
