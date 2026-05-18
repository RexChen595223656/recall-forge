import os
import base64
from cryptography.fernet import Fernet

_ENV_KEY = os.getenv("FERNET_KEY", "")
if _ENV_KEY:
    _cipher = Fernet(_ENV_KEY.encode())
else:
    # Generate a persistent key on first run
    _key_path = os.path.join(os.path.dirname(__file__), "..", "data", ".fernet_key")
    if os.path.exists(_key_path):
        with open(_key_path, "rb") as f:
            _cipher = Fernet(f.read())
    else:
        key = Fernet.generate_key()
        os.makedirs(os.path.dirname(_key_path), exist_ok=True)
        with open(_key_path, "wb") as f:
            f.write(key)
        _cipher = Fernet(key)


def encrypt(plain: str) -> str:
    return _cipher.encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    return _cipher.decrypt(token.encode()).decode()
