"""v4.0 materials API 集成测试 (generate, status, CRUD)"""
import pytest
from models.database import Material, Question


class TestGenerateStatus:
    def test_generate_returns_status(self, client, db):
        """TC-API-MT-01: generate 返回 generating 状态和 max_questions"""
        m = Material(title="test", content="a" * 100, format="text")
        db.add(m)
        db.commit()

        resp = client.post(f"/api/materials/{m.id}/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "generating"
        assert "max_questions" in data
        assert data["max_questions"] > 0

    def test_generate_404_missing_material(self, client):
        """TC-API-MT-02: 不存在材料 generate → 404"""
        resp = client.post("/api/materials/99999/generate")
        assert resp.status_code == 404

    def test_status_404_missing_material(self, client):
        """TC-API-MT-03: 不存在材料 status → 404"""
        resp = client.get("/api/materials/99999/status")
        assert resp.status_code == 404

    def test_status_idle_when_no_questions(self, client, db):
        """TC-API-MT-04: 无题目时 status → idle"""
        m = Material(title="test", content="b" * 100, format="text")
        db.add(m)
        db.commit()

        resp = client.get(f"/api/materials/{m.id}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "idle"
        assert data["question_count"] == 0

    def test_status_ready_when_has_questions(self, client, db):
        """TC-API-MT-05: 有题目时 status → ready"""
        m = Material(title="test", content="c" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()

        resp = client.get(f"/api/materials/{m.id}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
        assert data["question_count"] >= 1


class TestMaterialCRUD:
    def test_create_material_text(self, client):
        """TC-API-MT-06: 创建文本材料"""
        resp = client.post("/api/materials", data={
            "title": "Test Material",
            "content": "This is a test content with enough length to pass the 50 character minimum requirement.",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Material"
        assert data["format"] == "text"
        assert "id" in data
        assert data["chunk_count"] > 0

    def test_create_material_too_short(self, client):
        """TC-API-MT-07: 内容过短 → 400"""
        resp = client.post("/api/materials", data={
            "title": "Short",
            "content": "too short",
        })
        assert resp.status_code == 400

    def test_list_materials(self, client, db):
        """TC-API-MT-08: 材料列表"""
        m = Material(title="test", content="x" * 100, format="text")
        db.add(m)
        db.commit()

        resp = client.get("/api/materials")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

    def test_get_material_content(self, client, db):
        """TC-API-MT-09: 查看材料原文"""
        m = Material(title="test", content="Hello world " * 10, format="text")
        db.add(m)
        db.commit()

        resp = client.get(f"/api/materials/{m.id}/content")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "test"
        assert "Hello world" in data["content"]

    def test_get_material_content_404(self, client):
        """TC-API-MT-10: 查看不存在材料原文 → 404"""
        resp = client.get("/api/materials/99999/content")
        assert resp.status_code == 404

    def test_delete_material_cascade(self, client, db):
        """TC-API-MT-11: 删除材料级联清理"""
        m = Material(title="test", content="y" * 100, format="text")
        db.add(m)
        db.commit()
        q = Question(material_id=m.id, question="Q?", options=["A", "B", "C", "D"], answer="B", explanation="", tags=[])
        db.add(q)
        db.commit()
        m_id = m.id
        q_id = q.id

        resp = client.delete(f"/api/materials/{m_id}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify cascade — endpoint runs in its own session, expire to re-read
        db.expire_all()
        assert db.query(Material).filter(Material.id == m_id).first() is None
        assert db.query(Question).filter(Question.id == q_id).first() is None

    def test_delete_material_404(self, client):
        """TC-API-MT-12: 删除不存在材料 → 404"""
        resp = client.delete("/api/materials/99999")
        assert resp.status_code == 404
