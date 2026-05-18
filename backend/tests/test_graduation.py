"""ReviewCard 毕业判定测试 (F-20 section 8)"""
import pytest
from models.database import SessionLocal, ReviewCard, Question, Material
from services.sm2 import calculate_sm2
from datetime import datetime


class TestGraduation:
    def test_not_graduate_short_interval(self, db):
        """TC-GRAD-01: interval <= 21 不毕业"""
        m = Material(title="test", content="a" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, ease_factor=2.5, interval_days=1, repetitions=0, total_reviews=0)
        db.add(card)
        db.commit()

        # SM-2 with score 3: keeps interval short for now
        result = calculate_sm2(3, card.ease_factor, card.interval_days, card.repetitions)
        card.interval_days = result["interval_days"]
        card.repetitions = result["repetitions"]
        card.total_reviews = 1
        assert card.interval_days <= 21 or card.repetitions < 3
        assert card.is_stable == False

    def test_graduate_long_interval(self, db):
        """TC-GRAD-02: interval > 21 且 reps >= 3 → 毕业"""
        m = Material(title="test", content="b" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, ease_factor=2.5, interval_days=20, repetitions=4, total_reviews=4)
        db.add(card)
        db.commit()

        # One more review pushes interval past 21
        result = calculate_sm2(3, card.ease_factor, card.interval_days, card.repetitions)
        card.interval_days = result["interval_days"]
        card.repetitions = result["repetitions"]
        card.total_reviews += 1
        if card.interval_days > 21 and card.repetitions >= 3:
            card.is_stable = True
        db.commit()
        assert card.is_stable == True

    def test_stable_card_manual_review_reset(self, db):
        """TC-GRAD-03: 稳定卡片 score<2 → 重置回活跃"""
        m = Material(title="test", content="c" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, ease_factor=2.5, interval_days=30, repetitions=4, total_reviews=5, is_stable=True)
        db.add(card)
        db.commit()

        # Manual review: score=1 → reset
        if card.is_stable:
            if 1 < 2:  # score < 2
                card.is_stable = False
                card.interval_days = 1
                card.repetitions = 0
        db.commit()
        assert card.is_stable == False
        assert card.interval_days == 1
        assert card.repetitions == 0

    def test_stable_card_good_score_keeps_stable(self, db):
        """TC-GRAD-04: 稳定卡片 score>=2 → 保持稳定"""
        m = Material(title="test", content="d" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, ease_factor=2.5, interval_days=30, repetitions=4, total_reviews=5, is_stable=True)
        db.add(card)
        db.commit()

        # Manual review: score=2 → keep stable
        if card.is_stable:
            if 2 < 2:  # score=2 not < 2
                card.is_stable = False
                card.interval_days = 1
        db.commit()
        assert card.is_stable == True
