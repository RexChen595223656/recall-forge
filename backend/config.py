import os
from dotenv import load_dotenv

# Disable ChromaDB telemetry before any ChromaDB imports
os.environ["ANONYMIZED_TELEMETRY"] = "False"

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.deepseek.com/anthropic")
ANTHROPIC_AUTH_TOKEN = os.getenv("ANTHROPIC_AUTH_TOKEN", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "deepseek-v4-pro")

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "data", "chroma")
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "quiz.db")
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50
MAX_FILE_SIZE_MB = 10
