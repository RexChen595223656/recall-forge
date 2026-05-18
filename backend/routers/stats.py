from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from models.database import get_db, Question, Attempt, ReviewCard, Material, Setting
from services.rag import count_chunks
from datetime import datetime, timedelta, timezone

router = APIRouter()


@router.get("/material/{material_id}")
def get_material_stats(material_id: int, db: Session = Depends(get_db)):
    """获取单个材料的维度统计"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="材料不存在")

    # 题目统计
    questions = db.query(Question).filter(Question.material_id == material_id).all()
    total_questions = len(questions)
    question_ids = [q.id for q in questions]

    total_attempts = 0
    correct_attempts = 0
    if question_ids:
        total_attempts = db.query(Attempt).filter(Attempt.question_id.in_(question_ids)).count()
        correct_attempts = db.query(Attempt).filter(
            Attempt.question_id.in_(question_ids), Attempt.is_correct == 1
        ).count()

    accuracy = round(correct_attempts / total_attempts * 100, 1) if total_attempts > 0 else 0

    # 待复习（排除已稳定卡片）
    due_reviews = 0
    if question_ids:
        due_reviews = db.query(ReviewCard).filter(
            ReviewCard.question_id.in_(question_ids),
            ReviewCard.next_review <= datetime.utcnow(),
            ReviewCard.is_stable == False,
            ReviewCard.total_reviews >= 1,
        ).count()

    # v4.0 新增统计
    wrong_questions = 0
    if question_ids:
        subquery = db.query(Attempt.question_id).filter(Attempt.is_correct == 0).subquery()
        wrong_questions = db.query(Question).filter(
            Question.id.in_(subquery),
            Question.material_id == material_id,
            Question.mastered == False,
        ).count()

    mastered_questions = db.query(Question).filter(
        Question.material_id == material_id,
        Question.mastered == True,
    ).count()

    stable_cards = db.query(ReviewCard).filter(
        ReviewCard.question_id.in_(question_ids),
        ReviewCard.is_stable == True,
    ).count() if question_ids else 0

    # 学习进度：做过题数 / 总题数
    questions_attempted = 0
    questions_correct = 0
    if question_ids and total_questions > 0:
        questions_attempted = db.query(Attempt.question_id).filter(
            Attempt.question_id.in_(question_ids)
        ).distinct().count()
        questions_correct = db.query(Attempt.question_id).filter(
            Attempt.question_id.in_(question_ids),
            Attempt.is_correct == 1,
        ).distinct().count()

    # 最后活动时间
    last_activity = None
    if question_ids:
        last_attempt = db.query(Attempt).filter(
            Attempt.question_id.in_(question_ids)
        ).order_by(desc(Attempt.created_at)).first()
        if last_attempt:
            last_activity = last_attempt.created_at.isoformat()

    # 最近锻造记录（按轮次分组：间隔 > 5 分钟视为新的一轮）
    recent_sessions = []
    if question_ids:
        sub = db.query(Attempt.id).filter(
            Attempt.question_id.in_(question_ids)
        ).order_by(desc(Attempt.created_at)).limit(100).subquery()
        attempts = db.query(Attempt).filter(Attempt.id.in_(sub)).order_by(Attempt.created_at.asc()).all()
        sessions = []  # [{start_time, correct, total, items, seen_qids}]
        question_map = {q.id: q for q in questions}
        for a in attempts:
            # 判断是否属于当前轮次（与上一道题间隔 > 5 分钟则为新轮次）
            if not sessions or (a.created_at - sessions[-1]["start_time"]).total_seconds() > 300:
                sessions.append({"start_time": a.created_at, "correct": 0, "total": 0, "items": [], "seen_qids": set()})
            q = question_map.get(a.question_id)
            if q:
                if a.question_id in sessions[-1]["seen_qids"]:
                    # 同轮次同题：替换旧记录（保留最新 attempt）
                    for i, item in enumerate(sessions[-1]["items"]):
                        if item["question"] == q.question:
                            was_correct = item["is_correct"]
                            if was_correct:
                                sessions[-1]["correct"] -= 1
                            sessions[-1]["total"] -= 1
                            sessions[-1]["items"].pop(i)
                            break
                sessions[-1]["seen_qids"].add(a.question_id)
            sessions[-1]["total"] += 1
            if a.is_correct:
                sessions[-1]["correct"] += 1
            if q and len(sessions[-1]["items"]) < 20:
                options = q.options or []
                sessions[-1]["items"].append({
                    "question": q.question,
                    "options": options,
                    "user_answer": a.user_answer,
                    "correct_answer": q.answer,
                    "is_correct": bool(a.is_correct),
                    "explanation": q.explanation or "",
                })
        for s in reversed(sessions[:10]):  # 最新轮次排前面
            recent_sessions.append({
                "date": (s["start_time"].replace(tzinfo=timezone.utc) + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M"),
                "correct": s["correct"],
                "total": s["total"],
                "items": s["items"],
            })

    # 标签分布
    tag_counts = {}
    for q in questions:
        if q.tags:
            for tag in q.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    # 最近 3 轮正确率
    recent_accuracy = 0
    recent_rounds = recent_sessions[:3]
    recent_total = 0
    if recent_rounds:
        recent_total = sum(r["total"] for r in recent_rounds)
        recent_correct = sum(r["correct"] for r in recent_rounds)
        recent_accuracy = round(recent_correct / recent_total * 100, 1) if recent_total > 0 else 0

    # 趋势信号：近期 vs 累计差异 > 10% 时给出方向
    recent_trend = None
    if recent_total >= 5:
        diff = recent_accuracy - accuracy
        if diff > 10:
            recent_trend = "up"
        elif diff < -10:
            recent_trend = "down"

    # Check if this is the example material
    example_s = db.query(Setting).filter(Setting.key == "example_material_id").first()
    is_example = example_s is not None and example_s.value and int(example_s.value) == material_id

    return {
        "material_id": material_id,
        "title": material.title,
        "is_example": is_example,
        "total_questions": total_questions,
        "total_attempts": total_attempts,
        "correct_attempts": correct_attempts,
        "accuracy": accuracy,
        "recent_accuracy": recent_accuracy,
        "recent_trend": recent_trend,
        "questions_attempted": questions_attempted,
        "questions_correct": questions_correct,
        "due_reviews": due_reviews,
        "wrong_questions": wrong_questions,
        "mastered_questions": mastered_questions,
        "stable_cards": stable_cards,
        "last_activity": last_activity,
        "recent_sessions": recent_sessions,
        "tag_distribution": tag_counts,
        "total_chunks": count_chunks(material_id),
        "covered_chunks": len(set(q.chunk_id for q in questions if q.chunk_id)),
    }


@router.get("")
def get_stats(db: Session = Depends(get_db)):
    total_questions = db.query(Question).count()
    total_attempts = db.query(Attempt).count()
    correct_attempts = db.query(Attempt).filter(Attempt.is_correct == 1).count()
    accuracy = round(correct_attempts / total_attempts * 100, 1) if total_attempts > 0 else 0
    due_reviews = db.query(ReviewCard).filter(
        ReviewCard.next_review <= datetime.utcnow(),
        ReviewCard.is_stable == False,
        ReviewCard.total_reviews >= 1,
    ).count()
    total_materials = db.query(Material).count()

    # v4.0: 全局错题数
    subquery = db.query(Attempt.question_id).filter(Attempt.is_correct == 0).subquery()
    wrong_questions = db.query(Question).filter(
        Question.id.in_(subquery),
        Question.mastered == False,
    ).count()

    # Streak calculation
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

    # Tag distribution
    questions = db.query(Question).all()
    tag_counts = {}
    for q in questions:
        if q.tags:
            for tag in q.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    mastered_questions = db.query(Question).filter(Question.mastered == True).count()

    return {
        "total_questions": total_questions,
        "total_attempts": total_attempts,
        "total_materials": total_materials,
        "accuracy": accuracy,
        "due_reviews": due_reviews,
        "wrong_questions": wrong_questions,
        "mastered_questions": mastered_questions,
        "streak_days": streak,
        "tag_distribution": tag_counts,
    }
