from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from models.database import get_db, Question, Attempt, ReviewCard, Setting
from models.schemas import QuizGenerateRequest, QuizSubmitRequest, QuizSubmitResponse
from services.quiz_gen import generate_quiz_stream
from services.crypto import decrypt
from config import ANTHROPIC_AUTH_TOKEN

router = APIRouter()


@router.post("/generate")
async def generate_quiz(req: QuizGenerateRequest, db: Session = Depends(get_db)):
    # Collect already-used chunk IDs for this material to avoid duplicates
    used = db.query(Question.chunk_id).filter(
        Question.material_id == req.material_id,
        Question.chunk_id != ""
    ).all()
    exclude_ids = [r[0] for r in used]

    api_key = ""
    setting = db.query(Setting).filter(Setting.key == "api_key").first()
    if setting and setting.value:
        try:
            api_key = decrypt(setting.value)
        except Exception:
            pass

    return StreamingResponse(
        generate_quiz_stream(req.material_id, req.count, exclude_ids, req.mode, req.difficulty, req.question_type, getattr(req, "tag", ""), api_key=api_key),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/submit", response_model=QuizSubmitResponse)
def submit_answer(req: QuizSubmitRequest, db: Session = Depends(get_db)):
    question = db.query(Question).filter(Question.id == req.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    # Normalize multi-answer format: split by comma, trim, sort, compare
    def _normalize(ans: str) -> str:
        return ",".join(sorted(a.strip().upper() for a in ans.split(",") if a.strip()))
    is_correct = _normalize(req.user_answer) == _normalize(question.answer)

    attempt = Attempt(
        question_id=req.question_id,
        user_answer=req.user_answer,
        is_correct=1 if is_correct else 0,
    )
    db.add(attempt)

    # Update challenge_streak
    if is_correct:
        question.challenge_streak = (question.challenge_streak or 0) + 1
        if question.challenge_streak >= 3:
            question.mastered = True
    else:
        question.challenge_streak = 0
        question.mastered = False

    db.commit()
    db.refresh(question)

    return QuizSubmitResponse(
        is_correct=is_correct,
        correct_answer=question.answer,
        explanation=question.explanation or "",
        challenge_streak=question.challenge_streak or 0,
        mastered=question.mastered or False,
    )


@router.post("/save")
def save_question(data: dict, db: Session = Depends(get_db)):
    # 标准化答案：如果包含完整选项文本，提取首字母；多选保留逗号分隔
    raw_answer = data.get("answer", "")
    if raw_answer and "," in raw_answer:
        # 多选答案如 "A, C" 或 "A. xxx, B. yyy"
        parts = [p.strip() for p in raw_answer.split(",")]
        normalized_answer = ", ".join(p[0].upper() if p and p[0].isalpha() else p for p in parts)
    elif raw_answer and raw_answer[0].isalpha():
        normalized_answer = raw_answer[0].upper()
    else:
        normalized_answer = raw_answer

    question = Question(
        material_id=data.get("material_id"),
        chunk_id=data.get("chunk_id", ""),
        question=data["question"],
        options=data["options"],
        answer=normalized_answer,
        explanation=data.get("explanation", ""),
        tags=data.get("tags", []),
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return {"id": question.id}


@router.put("/{question_id}")
def update_question(question_id: int, data: dict, db: Session = Depends(get_db)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    if "question" in data:
        question.question = data["question"]
    if "options" in data:
        question.options = data["options"]
    if "answer" in data:
        raw = data["answer"]
        if raw and "," in raw:
            parts = [p.strip() for p in raw.split(",")]
            question.answer = ", ".join(p[0].upper() if p and p[0].isalpha() else p for p in parts)
        elif raw and raw[0].isalpha():
            question.answer = raw[0].upper()
        else:
            question.answer = raw
    if "explanation" in data:
        question.explanation = data["explanation"]
    if "tags" in data:
        question.tags = data["tags"]

    db.commit()
    db.refresh(question)
    return {
        "id": question.id,
        "question": question.question,
        "options": question.options,
        "answer": question.answer,
        "explanation": question.explanation or "",
        "tags": question.tags or [],
    }


@router.delete("/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db)):
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")

    # 级联删除关联数据
    db.query(ReviewCard).filter(ReviewCard.question_id == question_id).delete(synchronize_session=False)
    db.query(Attempt).filter(Attempt.question_id == question_id).delete(synchronize_session=False)
    db.delete(question)
    db.commit()
    return {"ok": True}
