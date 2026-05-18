from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MaterialCreate(BaseModel):
    title: str
    content: str
    format: str = "text"

class MaterialResponse(BaseModel):
    id: int
    title: str
    format: str
    created_at: datetime
    chunk_count: int = 0

    class Config:
        from_attributes = True

class QuizGenerateRequest(BaseModel):
    material_id: int
    count: int = 5
    mode: str = "extract"       # extract提取原文 | expand知识拓展
    difficulty: str = "medium"  # easy简单 | medium中等 | hard困难
    question_type: str = "single"  # single单选 | multi多选 | single,multi混合
    feedback_mode: str = "instant"  # instant即时反馈 | batch全部做完再看

class QuizSubmitRequest(BaseModel):
    question_id: int
    user_answer: str

class QuizSubmitResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: str
    challenge_streak: int = 0
    mastered: bool = False

class ReviewRecordRequest(BaseModel):
    question_id: int
    score: int

class StatsResponse(BaseModel):
    total_questions: int
    total_attempts: int
    total_materials: int
    accuracy: float
    due_reviews: int
    streak_days: int
    tag_distribution: dict
