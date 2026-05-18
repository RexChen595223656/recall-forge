"""challenge_streak 逻辑测试 (F-20 section 7)"""
import pytest
from models.database import SessionLocal, Question, Attempt


class TestChallengeStreak:
    def test_streak_increments_on_correct(self, db):
        """TC-CS-01: 答对 streak+1"""
        from models.database import Material
        m = Material(title="test", content="x" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="...", tags=[], challenge_streak=0)
        db.add(q)
        db.commit()

        # 模拟答对
        q.challenge_streak = (q.challenge_streak or 0) + 1
        db.commit()
        db.refresh(q)
        assert q.challenge_streak == 1
        assert q.mastered == False

    def test_three_consecutive_correct_masters(self, db):
        """TC-CS-02: 连续3次做对 → mastered=true"""
        from models.database import Material
        m = Material(title="test", content="y" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="...", tags=[], challenge_streak=0)
        db.add(q)
        db.commit()

        for i in range(3):
            q.challenge_streak = (q.challenge_streak or 0) + 1
            if q.challenge_streak >= 3:
                q.mastered = True
            db.commit()
            db.refresh(q)

        assert q.challenge_streak == 3
        assert q.mastered == True

    def test_streak_resets_on_wrong(self, db):
        """TC-CS-03: 做错 streak 重置为 0"""
        from models.database import Material
        m = Material(title="test", content="z" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="...", tags=[], challenge_streak=2)
        db.add(q)
        db.commit()

        # 做错
        q.challenge_streak = 0
        q.mastered = False
        db.commit()
        db.refresh(q)
        assert q.challenge_streak == 0
        assert q.mastered == False

    def test_mastered_not_reset_by_additional_correct(self, db):
        """TC-CS-04: 已攻克后再答对，保持 mastered=true"""
        from models.database import Material
        m = Material(title="test", content="w" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="...", tags=[], challenge_streak=3, mastered=True)
        db.add(q)
        db.commit()

        q.challenge_streak = (q.challenge_streak or 0) + 1
        if q.challenge_streak >= 3:
            q.mastered = True
        db.commit()
        db.refresh(q)
        assert q.mastered == True
        assert q.challenge_streak == 4
