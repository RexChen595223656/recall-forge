from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from config import SQLITE_DB_PATH
import os

os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)

engine = create_engine(f"sqlite:///{SQLITE_DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500))
    content = Column(Text)
    format = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    material_id = Column(Integer, ForeignKey("materials.id"))
    chunk_id = Column(String(200))
    question = Column(Text)
    options = Column(JSON)
    answer = Column(String(20))
    explanation = Column(Text)
    tags = Column(JSON)
    challenge_streak = Column(Integer, default=0)
    mastered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String(20))
    is_correct = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReviewCard(Base):
    __tablename__ = "review_cards"
    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    question = relationship("Question", lazy="select")
    ease_factor = Column(Float, default=2.5)
    interval_days = Column(Integer, default=1)
    repetitions = Column(Integer, default=0)
    total_reviews = Column(Integer, default=0)
    is_stable = Column(Boolean, default=False)
    next_review = Column(DateTime, default=datetime.utcnow)
    last_review = Column(DateTime, nullable=True)

class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, default="")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
