"""v4.0 stats API 集成测试 (新字段: wrong_questions, mastered_questions, stable_cards)"""
import pytest
from models.database import Material, Question, ReviewCard, Attempt
from datetime import datetime


class TestGlobalStats:
    def test_global_stats_includes_wrong_questions(self, client, db):
        """TC-API-ST-01: 全局统计包含 wrong_questions 字段"""
        m = Material(title="test", content="a" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], mastered=False)
        db.add(q)
        db.commit()
        db.add(Attempt(question_id=q.id, user_answer="A", is_correct=0))
        db.commit()

        resp = client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "wrong_questions" in data
        assert data["wrong_questions"] == 1

    def test_global_stats_wrong_questions_excludes_mastered(self, client, db):
        """TC-API-ST-02: 全局错题数排除已攻克的题目"""
        m = Material(title="test", content="b" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], mastered=True)
        db.add(q)
        db.commit()
        db.add(Attempt(question_id=q.id, user_answer="A", is_correct=0))
        db.commit()

        resp = client.get("/api/stats")
        assert resp.status_code == 200
        assert resp.json()["wrong_questions"] == 0

    def test_global_stats_due_reviews_excludes_stable(self, client, db):
        """TC-API-ST-03: 全局到期复习排除稳定卡片"""
        m = Material(title="test", content="c" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(
            question_id=q.id, is_stable=True, total_reviews=5,
            next_review=datetime.utcnow()
        )
        db.add(card)
        db.commit()

        resp = client.get("/api/stats")
        assert resp.status_code == 200
        assert resp.json()["due_reviews"] == 0

    def test_global_stats_empty(self, client, db):
        """TC-API-ST-04: 空数据库统计返回默认值"""
        resp = client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_questions"] == 0
        assert data["wrong_questions"] == 0
        assert data["due_reviews"] == 0
        assert data["accuracy"] == 0


class TestMaterialStats:
    def test_material_stats_v4_fields(self, client, db):
        """TC-API-ST-05: 材料统计包含 v4.0 新字段"""
        m = Material(title="Test", content="d" * 100, format="text")
        db.add(m)
        db.commit()

        resp = client.get(f"/api/stats/material/{m.id}")
        assert resp.status_code == 200
        data = resp.json()
        for field in ["wrong_questions", "mastered_questions", "stable_cards"]:
            assert field in data, f"Missing field: {field}"

    def test_material_stats_wrong_questions_count(self, client, db):
        """TC-API-ST-06: 材料错题数正确统计"""
        m = Material(title="test", content="e" * 100, format="text")
        db.add(m)
        db.commit()
        q1 = Question(material_id=m.id, question="Q1?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], mastered=False)
        q2 = Question(material_id=m.id, question="Q2?", options=["A", "B", "C", "D"], answer="C", explanation="", tags=[], mastered=False)
        db.add_all([q1, q2])
        db.commit()
        db.add(Attempt(question_id=q1.id, user_answer="A", is_correct=0))
        db.add(Attempt(question_id=q2.id, user_answer="A", is_correct=0))
        db.commit()

        resp = client.get(f"/api/stats/material/{m.id}")
        assert resp.status_code == 200
        assert resp.json()["wrong_questions"] == 2

    def test_material_stats_mastered_count(self, client, db):
        """TC-API-ST-07: 材料已攻克数正确统计"""
        m = Material(title="test", content="f" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], mastered=True)
        db.add(q)
        db.commit()

        resp = client.get(f"/api/stats/material/{m.id}")
        assert resp.status_code == 200
        assert resp.json()["mastered_questions"] == 1

    def test_material_stats_stable_cards_count(self, client, db):
        """TC-API-ST-08: 材料稳定卡片数正确统计"""
        m = Material(title="test", content="g" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, is_stable=True, interval_days=30)
        db.add(card)
        db.commit()

        resp = client.get(f"/api/stats/material/{m.id}")
        assert resp.status_code == 200
        assert resp.json()["stable_cards"] == 1

    def test_material_stats_404(self, client):
        """TC-API-ST-09: 不存在的材料 → 404"""
        resp = client.get("/api/stats/material/99999")
        assert resp.status_code == 404
