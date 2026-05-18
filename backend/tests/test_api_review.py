"""v4.0 review API 集成测试 (graduation, wrong-questions, stable-cards)"""
import pytest
from models.database import Material, Question, ReviewCard, Attempt
from datetime import datetime, timedelta


class TestReviewRecord:
    def test_record_review_non_stable_sm2(self, client, db):
        """TC-API-RV-01: 非稳定卡片评分 → SM-2 更新"""
        m = Material(title="test", content="a" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()
        card = ReviewCard(
            question_id=q.id, ease_factor=2.5, interval_days=5,
            repetitions=2, total_reviews=2, is_stable=False
        )
        db.add(card)
        db.commit()

        resp = client.post("/api/review/record", json={"question_id": q.id, "score": 3})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["interval_days"] > 5
        assert "next_review" in data

    def test_record_review_stable_good_score(self, client, db):
        """TC-API-RV-02: 稳定卡片 score>=2 → 保持稳定"""
        m = Material(title="test", content="b" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()
        next_review = datetime.utcnow() + timedelta(days=30)
        card = ReviewCard(
            question_id=q.id, ease_factor=2.5, interval_days=30,
            repetitions=4, total_reviews=5, is_stable=True,
            next_review=next_review
        )
        db.add(card)
        db.commit()

        resp = client.post("/api/review/record", json={"question_id": q.id, "score": 3})
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_stable"] is True

    def test_record_review_stable_bad_score_resets(self, client, db):
        """TC-API-RV-03: 稳定卡片 score<2 → 重置为活跃"""
        m = Material(title="test", content="c" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()
        card = ReviewCard(
            question_id=q.id, ease_factor=2.5, interval_days=30,
            repetitions=4, total_reviews=5, is_stable=True,
            next_review=datetime.utcnow() + timedelta(days=30)
        )
        db.add(card)
        db.commit()

        resp = client.post("/api/review/record", json={"question_id": q.id, "score": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_stable"] is False
        assert data["interval_days"] == 1

    def test_record_review_creates_card_if_missing(self, client, db):
        """TC-API-RV-04: 不存在的卡片自动创建"""
        m = Material(title="test", content="d" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()

        resp = client.post("/api/review/record", json={"question_id": q.id, "score": 2})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestEnroll:
    def test_enroll_new_question(self, client, db):
        """TC-API-RV-05: 登记题目到复习计划"""
        m = Material(title="test", content="e" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()

        resp = client.post(f"/api/review/enroll/{q.id}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_enroll_duplicate_noop(self, client, db):
        """TC-API-RV-06: 重复登记不报错"""
        m = Material(title="test", content="f" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(
            material_id=m.id, question="Q?", options=["A", "B", "C", "D"],
            answer="B", explanation="", tags=[]
        )
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id)
        db.add(card)
        db.commit()

        resp = client.post(f"/api/review/enroll/{q.id}")
        assert resp.status_code == 200
        assert "已在复习计划中" in resp.json()["message"]


class TestDueReviews:
    def test_due_reviews_excludes_stable(self, client, db):
        """TC-API-RV-07: 到期复习不包含稳定卡片"""
        m = Material(title="test", content="g" * 100, format="text")
        db.add(m)
        db.commit()
        q1 = Question(material_id=m.id, question="Q1?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        q2 = Question(material_id=m.id, question="Q2?", options=["A", "B", "C", "D"], answer="C", explanation="", tags=[])
        db.add_all([q1, q2])
        db.commit()

        past = datetime.utcnow() - timedelta(days=1)
        future = datetime.utcnow() + timedelta(days=30)
        card1 = ReviewCard(question_id=q1.id, is_stable=False, total_reviews=1, next_review=past)
        card2 = ReviewCard(question_id=q2.id, is_stable=True, total_reviews=5, next_review=past)
        db.add_all([card1, card2])
        db.commit()

        resp = client.get("/api/review/due")
        assert resp.status_code == 200
        data = resp.json()
        ids = [r["question_id"] for r in data]
        assert q1.id in ids
        assert q2.id not in ids

    def test_due_reviews_excludes_zero_reviews(self, client, db):
        """TC-API-RV-08: 到期复习排除未复习过的卡片"""
        m = Material(title="test", content="h" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, is_stable=False, total_reviews=0, next_review=datetime.utcnow() - timedelta(days=1))
        db.add(card)
        db.commit()

        resp = client.get("/api/review/due")
        assert resp.status_code == 200
        ids = [r["question_id"] for r in resp.json()]
        assert q.id not in ids

    def test_due_reviews_includes_is_stable_and_material_title(self, client, db):
        """TC-API-RV-09: 到期复习返回 is_stable 和 material_title 字段"""
        m = Material(title="Test Material", content="i" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        card = ReviewCard(question_id=q.id, is_stable=False, total_reviews=1, next_review=datetime.utcnow() - timedelta(hours=1))
        db.add(card)
        db.commit()

        resp = client.get("/api/review/due")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        item = data[0]
        assert "is_stable" in item
        assert item["is_stable"] is False
        assert "material_title" in item
        assert item["material_title"] == "Test Material"


class TestWrongQuestions:
    def test_wrong_questions_only_unmastered(self, client, db):
        """TC-API-RV-10: 错题列表只包含未攻克的题目"""
        m = Material(title="test", content="j" * 100, format="text")
        db.add(m)
        db.commit()
        q1 = Question(material_id=m.id, question="Q1?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], challenge_streak=0, mastered=False)
        q2 = Question(material_id=m.id, question="Q2?", options=["A", "B", "C", "D"], answer="C", explanation="", tags=[], challenge_streak=3, mastered=True)
        db.add_all([q1, q2])
        db.commit()
        # Both have wrong attempts
        db.add(Attempt(question_id=q1.id, user_answer="A", is_correct=0))
        db.add(Attempt(question_id=q2.id, user_answer="A", is_correct=0))
        db.commit()

        resp = client.get("/api/review/wrong-questions")
        assert resp.status_code == 200
        data = resp.json()
        ids = [r["id"] for r in data]
        assert q1.id in ids
        assert q2.id not in ids

    def test_wrong_questions_no_wrong_attempts(self, client, db):
        """TC-API-RV-11: 无错题记录时返回空"""
        m = Material(title="test", content="k" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], mastered=False)
        db.add(q)
        db.commit()

        resp = client.get("/api/review/wrong-questions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_wrong_questions_ordered_by_streak_asc(self, client, db):
        """TC-API-RV-12: 错题按 streak 升序排列（低 streak 优先）"""
        m = Material(title="test", content="l" * 100, format="text")
        db.add(m)
        db.commit()
        q1 = Question(material_id=m.id, question="Q1?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[], challenge_streak=0, mastered=False)
        q2 = Question(material_id=m.id, question="Q2?", options=["A", "B", "C", "D"], answer="C", explanation="", tags=[], challenge_streak=2, mastered=False)
        db.add_all([q1, q2])
        db.commit()
        db.add(Attempt(question_id=q1.id, user_answer="A", is_correct=0))
        db.add(Attempt(question_id=q2.id, user_answer="A", is_correct=0))
        db.commit()

        resp = client.get("/api/review/wrong-questions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2
        assert data[0]["challenge_streak"] <= data[1]["challenge_streak"]


class TestStableCards:
    def test_stable_cards_only_is_stable_true(self, client, db):
        """TC-API-RV-13: 稳定卡片列表只返回 is_stable=True"""
        m = Material(title="test", content="m" * 100, format="text")
        db.add(m)
        db.commit()
        q1 = Question(material_id=m.id, question="Q1?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        q2 = Question(material_id=m.id, question="Q2?", options=["A", "B", "C", "D"], answer="C", explanation="", tags=[])
        db.add_all([q1, q2])
        db.commit()
        card1 = ReviewCard(question_id=q1.id, is_stable=True, interval_days=30, last_review=datetime.utcnow())
        card2 = ReviewCard(question_id=q2.id, is_stable=False, interval_days=5, last_review=datetime.utcnow())
        db.add_all([card1, card2])
        db.commit()

        resp = client.get("/api/review/stable-cards")
        assert resp.status_code == 200
        data = resp.json()
        ids = [c["question_id"] for c in data]
        assert q1.id in ids
        assert q2.id not in ids

    def test_stable_cards_empty(self, client, db):
        """TC-API-RV-14: 无稳定卡片返回空"""
        resp = client.get("/api/review/stable-cards")
        assert resp.status_code == 200
        assert resp.json() == []
