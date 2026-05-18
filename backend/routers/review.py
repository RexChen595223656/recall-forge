from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db, ReviewCard, Question, Attempt, Material
from models.schemas import ReviewRecordRequest
from services.sm2 import calculate_sm2
from datetime import datetime

router = APIRouter()


@router.get("/due")
def get_due_reviews(material_id: int = None, limit: int = 50, show_all: bool = False, db: Session = Depends(get_db)):
    now = datetime.utcnow()

    if show_all:
        query = db.query(ReviewCard).filter(ReviewCard.is_stable == False, ReviewCard.total_reviews >= 1)
    else:
        query = db.query(ReviewCard).filter(
            ReviewCard.next_review <= now,
            ReviewCard.is_stable == False,
            ReviewCard.total_reviews >= 1,
        )

    if material_id:
        query = query.join(Question).filter(Question.material_id == material_id)

    cards = query.order_by(ReviewCard.next_review.asc()).limit(limit).all()

    results = []
    for card in cards:
        question = db.query(Question).filter(Question.id == card.question_id).first()
        material_title = ""
        if question:
            material = db.query(Material).filter(Material.id == question.material_id).first()
            material_title = material.title if material else ""
        if question:
            is_due = card.next_review <= now
            results.append({
                "review_id": card.id,
                "question_id": question.id,
                "question": question.question,
                "options": question.options,
                "answer": question.answer,
                "explanation": question.explanation or "",
                "tags": question.tags or [],
                "ease_factor": card.ease_factor,
                "interval_days": card.interval_days,
                "repetitions": card.repetitions,
                "total_reviews": card.total_reviews or 0,
                "next_review": card.next_review.isoformat(),
                "is_due": is_due,
                "is_stable": card.is_stable or False,
                "material_title": material_title,
            })
    return results


@router.post("/record")
def record_review(req: ReviewRecordRequest, db: Session = Depends(get_db)):
    card = db.query(ReviewCard).filter(ReviewCard.question_id == req.question_id).first()
    if not card:
        card = ReviewCard(question_id=req.question_id)
        db.add(card)
        db.flush()

    # 稳定卡片手动复习：不执行 SM-2，直接走分支
    if card.is_stable:
        if req.score < 2:
            card.is_stable = False
            card.interval_days = 1
            card.repetitions = 0
            card.next_review = datetime.utcnow()
        card.last_review = datetime.utcnow()
        db.commit()
        return {
            "ok": True,
            "next_review": card.next_review.isoformat(),
            "interval_days": card.interval_days,
            "is_stable": card.is_stable,
        }

    # 非稳定卡片：正常 SM-2 流程
    result = calculate_sm2(req.score, card.ease_factor, card.interval_days, card.repetitions)
    card.ease_factor = result["ease_factor"]
    card.interval_days = result["interval_days"]
    card.repetitions = result["repetitions"]
    card.total_reviews = (card.total_reviews or 0) + 1

    # 毕业判定：间隔 > 21 天且连续成功 >= 3 次
    if card.interval_days > 21 and card.repetitions >= 3:
        card.is_stable = True

    card.next_review = result["next_review"]
    card.last_review = datetime.utcnow()
    db.commit()

    return {
        "ok": True,
        "next_review": result["next_review"].isoformat(),
        "interval_days": result["interval_days"],
        "is_stable": card.is_stable,
    }


@router.post("/enroll/{question_id}")
def enroll_question(question_id: int, db: Session = Depends(get_db)):
    existing = db.query(ReviewCard).filter(ReviewCard.question_id == question_id).first()
    if existing:
        return {"ok": True, "message": "已在复习计划中"}

    card = ReviewCard(question_id=question_id)
    db.add(card)
    db.commit()
    return {"ok": True}


@router.get("/wrong-questions")
def get_wrong_questions(material_id: int = None, db: Session = Depends(get_db)):
    query = db.query(Question).filter(Question.mastered == False)
    if material_id:
        query = query.filter(Question.material_id == material_id)
    # 只返回有错误 Attempt 的题目
    subquery = db.query(Attempt.question_id).filter(Attempt.is_correct == 0).subquery()
    query = query.filter(Question.id.in_(subquery))
    questions = query.order_by(Question.challenge_streak.asc()).limit(50).all()
    return [{
        "id": q.id,
        "question": q.question,
        "options": q.options,
        "answer": q.answer,
        "explanation": q.explanation or "",
        "tags": q.tags or [],
        "challenge_streak": q.challenge_streak or 0,
        "mastered": q.mastered or False,
    } for q in questions]


@router.get("/stable-cards")
def get_stable_cards(material_id: int = None, db: Session = Depends(get_db)):
    query = db.query(ReviewCard).filter(ReviewCard.is_stable == True)
    if material_id:
        query = query.join(Question).filter(Question.material_id == material_id)
    cards = query.order_by(ReviewCard.last_review.desc()).limit(50).all()
    return [{
        "review_id": c.id,
        "question_id": c.question_id,
        "question": c.question.question if c.question else "",
        "options": c.question.options if c.question else [],
        "answer": c.question.answer if c.question else "",
        "ease_factor": c.ease_factor,
        "interval_days": c.interval_days,
        "repetitions": c.repetitions,
        "total_reviews": c.total_reviews or 0,
        "last_review": c.last_review.isoformat() if c.last_review else None,
        "is_stable": c.is_stable,
    } for c in cards]
