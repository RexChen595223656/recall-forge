"""Test fixtures for v4.0 backend tests"""
import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use a separate test database to avoid corrupting the dev server
os.environ["TESTING"] = "1"
import config
config.SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "test_quiz.db")

from models.database import Base, SessionLocal, engine
from main import app
from fastapi.testclient import TestClient
from routers import materials as _materials_router


@pytest.fixture(autouse=True)
def clean_db():
    """Reset database before each test"""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # Clear any stale generation threads from previous tests
    _materials_router._generation_tasks.clear()
    _materials_router._generation_errors.clear()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    """Get a fresh DB session"""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    """FastAPI TestClient"""
    return TestClient(app)
