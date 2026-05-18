from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import materials, quiz, review, stats
from routers.settings import router as settings_router
from routers.intent import router as intent_router
from services.seed_example import seed_if_empty

app = FastAPI(title="铭知 RecallForge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materials.router, prefix="/api/materials", tags=["materials"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["quiz"])
app.include_router(review.router, prefix="/api/review", tags=["review"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(intent_router, prefix="/api/intent", tags=["intent"])


@app.on_event("startup")
def on_startup():
    seed_if_empty()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/seed-example")
def seed_example():
    return seed_if_empty()
