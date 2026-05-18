from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.database import get_db, Material, Question, Attempt, ReviewCard, Setting
from models.schemas import MaterialResponse
from services.rag import chunk_text, embed_and_store, delete_material_chunks, count_chunks
from services.parser import parse_url, parse_pdf, parse_markdown
from services.quiz_gen import generate_quiz_sync
from services.crypto import decrypt
from config import MAX_FILE_SIZE_MB, ANTHROPIC_AUTH_TOKEN
from models.database import Setting
import threading

router = APIRouter()

# Track in-progress generation threads (resets on server restart)
_generation_threads: dict[int, threading.Thread] = {}
_generation_errors: dict[int, str] = {}


@router.post("", response_model=MaterialResponse)
async def create_material(
    title: str = Form(...),
    content: str = Form(None),
    url: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    text = ""

    if url:
        try:
            text = await parse_url(url)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"网页解析失败：{str(e)}")
    elif file:
        if file.size and file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"文件超过 {MAX_FILE_SIZE_MB}MB 限制")
        raw = await file.read()
        if file.filename and file.filename.endswith('.pdf'):
            text = parse_pdf(raw, file.filename)
        elif file.filename and file.filename.endswith('.md'):
            text = parse_markdown(raw.decode('utf-8'))
        else:
            text = raw.decode('utf-8')
    elif content:
        text = content
    else:
        raise HTTPException(status_code=400, detail="请提供材料内容、网页链接或文件")

    if len(text) < 50:
        raise HTTPException(status_code=400, detail="内容过短，至少需要 50 字")

    fmt = "url" if url else ("file" if file else "text")
    material = Material(title=title, content=text, format=fmt)
    db.add(material)
    db.commit()
    db.refresh(material)

    chunks = chunk_text(text)
    embed_and_store(chunks, material.id)

    return {"id": material.id, "title": material.title, "format": material.format, "created_at": material.created_at.isoformat(), "chunk_count": len(chunks)}


@router.get("", response_model=list[MaterialResponse])
def list_materials(db: Session = Depends(get_db)):
    return db.query(Material).order_by(Material.created_at.desc()).all()


@router.get("/{material_id}/content")
def get_material_content(material_id: int, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")
    return {"id": material.id, "title": material.title, "content": material.content, "format": material.format}


@router.delete("/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")

    # Protect example material from deletion
    example_setting = db.query(Setting).filter(Setting.key == "example_material_id").first()
    if example_setting and example_setting.value and int(example_setting.value) == material_id:
        raise HTTPException(status_code=403, detail="示例材料不可删除")

    # 级联删除关联数据：复习卡片 → 答题记录 → 题目 → 材料
    question_ids = [q[0] for q in db.query(Question.id).filter(Question.material_id == material_id).all()]

    if question_ids:
        db.query(ReviewCard).filter(ReviewCard.question_id.in_(question_ids)).delete(synchronize_session=False)
        db.query(Attempt).filter(Attempt.question_id.in_(question_ids)).delete(synchronize_session=False)
        db.query(Question).filter(Question.material_id == material_id).delete(synchronize_session=False)

    delete_material_chunks(material_id)
    db.delete(material)
    db.commit()
    return {"ok": True}


@router.get("/{material_id}/questions")
def list_questions(
    material_id: int,
    count: int = 0,
    tags: str = "",
    exclude_mastered: bool = False,
    exclude_ids: str = "",
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")
    query = db.query(Question).filter(Question.material_id == material_id)
    if exclude_mastered:
        query = query.filter(Question.mastered == False)
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            for tag in tag_list:
                query = query.filter(Question.tags.contains(tag))
    if exclude_ids:
        id_list = [int(i.strip()) for i in exclude_ids.split(",") if i.strip().isdigit()]
        if id_list:
            query = query.filter(~Question.id.in_(id_list))
    query = query.order_by(func.random())
    if count > 0:
        query = query.limit(count)
    questions = query.all()
    return [{"id": q.id, "question": q.question, "options": q.options, "answer": q.answer, "explanation": q.explanation, "tags": q.tags, "challenge_streak": q.challenge_streak or 0, "mastered": q.mastered or False} for q in questions]


@router.post("/{material_id}/questions")
def create_question(material_id: int, data: dict, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")

    raw_answer = data.get("answer", "")
    if raw_answer and "," in raw_answer:
        parts = [p.strip() for p in raw_answer.split(",")]
        normalized = ", ".join(p[0].upper() if p and p[0].isalpha() else p for p in parts)
    elif raw_answer and raw_answer[0].isalpha():
        normalized = raw_answer[0].upper()
    else:
        normalized = raw_answer

    question = Question(
        material_id=material_id,
        chunk_id=data.get("chunk_id", ""),
        question=data["question"],
        options=data["options"],
        answer=normalized,
        explanation=data.get("explanation", ""),
        tags=data.get("tags", []),
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return {"id": question.id}


@router.post("/{material_id}/generate")
def generate_questions(
    material_id: int,
    exclude_covered: bool = False,
    mode: str = "extract",
    difficulty: str = "medium",
    question_type: str = "single",
    tag: str = "",
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")

    total_chunks = count_chunks(material_id)
    max_questions = min(total_chunks * 3, 5)
    if max_questions < 1:
        max_questions = 1

    exclude_ids = []
    if exclude_covered:
        used = db.query(Question.chunk_id).filter(Question.material_id == material_id, Question.chunk_id != "").all()
        exclude_ids = [r[0] for r in used]

    def run_generation():
        gen_db = next(get_db())
        # Get user-set API key, fall back to server env var
        api_key = ""
        try:
            setting = gen_db.query(Setting).filter(Setting.key == "api_key").first()
            if setting and setting.value:
                api_key = decrypt(setting.value)
        except Exception:
            pass
        if not api_key:
            api_key = ANTHROPIC_AUTH_TOKEN
        try:
            result = generate_quiz_sync(material_id, max_questions, exclude_ids, mode, difficulty, question_type, tag, api_key=api_key)
            if "error" in result:
                _generation_errors[material_id] = result["error"]
                return
            if "questions" in result:
                chunk_ids = result.get("chunk_ids", [])
                for i, q in enumerate(result["questions"]):
                    chunk_id = chunk_ids[i % len(chunk_ids)] if chunk_ids else ""
                    question = Question(
                        material_id=material_id,
                        chunk_id=chunk_id,
                        question=q["question"],
                        options=q["options"],
                        answer=q.get("answer", "") or ",".join(q.get("answers", [])),
                        explanation=q.get("explanation", ""),
                        tags=q.get("tags", []),
                    )
                    gen_db.add(question)
                gen_db.commit()
        except Exception as e:
            _generation_errors[material_id] = str(e)
        finally:
            gen_db.close()

    thread = threading.Thread(target=run_generation)
    _generation_threads[material_id] = thread
    thread.start()

    return {"status": "generating", "max_questions": max_questions}


@router.get("/{material_id}/status")
def get_generation_status(material_id: int, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")

    total_chunks = count_chunks(material_id)
    question_count = db.query(Question).filter(Question.material_id == material_id).count()
    max_expected = min(total_chunks * 3, 5)

    thread = _generation_threads.get(material_id)
    if thread and thread.is_alive():
        return {"status": "generating", "max_questions": max_expected}

    error = _generation_errors.pop(material_id, None)
    if error:
        return {"status": "error", "message": error}

    if question_count > 0:
        return {"status": "ready", "question_count": question_count}

    return {"status": "idle", "question_count": 0}
