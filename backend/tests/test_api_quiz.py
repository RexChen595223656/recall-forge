"""v4.0 quiz API 集成测试 (streak + mastered)"""
import pytest
from models.database import Material, Question


class TestQuizSubmitStreak:
    def test_submit_correct_increments_streak(self, client, db):
        """TC-API-QZ-01: 答对 streak+1，mastered=false（未满3次）"""
        m = Material(title="test", content="a" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[], challenge_streak=0, mastered=False
        )
        db.add(q)
        db.commit()

        resp = client.post("/api/quiz/submit", json={"question_id": q.id, "user_answer": "B"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_correct"] is True
        assert data["challenge_streak"] == 1
        assert data["mastered"] is False

    def test_submit_three_correct_masters(self, client, db):
        """TC-API-QZ-02: 连续3次答对 → mastered=true"""
        m = Material(title="test", content="b" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[], challenge_streak=0, mastered=False
        )
        db.add(q)
        db.commit()

        for i in range(3):
            resp = client.post("/api/quiz/submit", json={"question_id": q.id, "user_answer": "B"})
            assert resp.status_code == 200

        data = resp.json()
        assert data["challenge_streak"] == 3
        assert data["mastered"] is True

    def test_submit_wrong_resets_streak(self, client, db):
        """TC-API-QZ-03: 答错 streak=0, mastered=false"""
        m = Material(title="test", content="c" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[], challenge_streak=2, mastered=False
        )
        db.add(q)
        db.commit()

        resp = client.post("/api/quiz/submit", json={"question_id": q.id, "user_answer": "A"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_correct"] is False
        assert data["challenge_streak"] == 0
        assert data["mastered"] is False

    def test_submit_unknown_question_404(self, client):
        """TC-API-QZ-04: 提交不存在的题目 → 404"""
        resp = client.post("/api/quiz/submit", json={"question_id": 99999, "user_answer": "A"})
        assert resp.status_code == 404

    def test_case_insensitive_answer(self, client, db):
        """TC-API-QZ-05: 答案大小写不敏感"""
        m = Material(title="test", content="d" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()

        resp = client.post("/api/quiz/submit", json={"question_id": q.id, "user_answer": "b"})
        assert resp.status_code == 200
        assert resp.json()["is_correct"] is True


class TestQuestionListV4:
    def test_list_questions_includes_streak_and_mastered(self, client, db):
        """TC-API-QZ-06: list_questions 返回 challenge_streak 和 mastered"""
        m = Material(title="test", content="e" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[], challenge_streak=2, mastered=False
        )
        db.add(q)
        db.commit()

        resp = client.get(f"/api/materials/{m.id}/questions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["challenge_streak"] == 2
        assert data[0]["mastered"] is False
