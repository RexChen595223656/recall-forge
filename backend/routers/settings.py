from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db, Setting
from services.crypto import encrypt
from pydantic import BaseModel

router = APIRouter()


class KeySaveRequest(BaseModel):
    api_key: str


@router.post("/key")
def save_api_key(req: KeySaveRequest, db: Session = Depends(get_db)):
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API Key 不能为空")
    if len(key) < 10:
        raise HTTPException(status_code=400, detail="API Key 格式不正确")

    encrypted = encrypt(key)
    setting = db.query(Setting).filter(Setting.key == "api_key").first()
    if setting:
        setting.value = encrypted
    else:
        db.add(Setting(key="api_key", value=encrypted))
    db.commit()
    return {"ok": True}


@router.get("/key")
def get_key_status(db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == "api_key").first()
    if setting and setting.value:
        # Return masked key — never expose the real one
        return {
            "configured": True,
            "preview": "已配置",
        }
    return {"configured": False, "preview": ""}


def get_user_api_key(db: Session) -> str:
    """Get decrypted user API key, or fall back to env var"""
    setting = db.query(Setting).filter(Setting.key == "api_key").first()
    if setting and setting.value:
        from services.crypto import decrypt
        return decrypt(setting.value)
    from config import ANTHROPIC_AUTH_TOKEN
    return ANTHROPIC_AUTH_TOKEN
