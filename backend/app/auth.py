import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional
from fastapi import Request

AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "true").lower() not in ("0", "false", "no")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "serra@serrastudio.it").strip().lower()
_DEFAULT_SALT = "assistente-serrastudio-2026"
_DEFAULT_PBKDF2_HASH = "fba99bcc0f174f368551a1a8a41bde2e073b2f821ab19d3f27709e0bf944fee5"

AUTH_COOKIE_NAME = "assistente_token"
TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL_SECONDS", str(30 * 24 * 3600)))


def _get_auth_secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET") or os.environ.get("ADMIN_PASSWORD") or _DEFAULT_PBKDF2_HASH
    return hashlib.sha256(f"assistente-jwt:{secret}".encode("utf-8")).digest()


def verify_credentials(email: str, password: str) -> bool:
    if not email or not password:
        return False
    normalized_email = email.strip().lower()
    if not hmac.compare_digest(normalized_email, ADMIN_EMAIL):
        return False

    env_password = os.environ.get("ADMIN_PASSWORD")
    if env_password:
        return hmac.compare_digest(password, env_password)

    expected_hash = os.environ.get("ADMIN_PASSWORD_HASH", _DEFAULT_PBKDF2_HASH)
    salt = os.environ.get("ADMIN_PASSWORD_SALT", _DEFAULT_SALT)
    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()
    return hmac.compare_digest(computed, expected_hash)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(email: str) -> str:
    payload = {
        "sub": email.strip().lower(),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(_get_auth_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(sig)}"


def verify_access_token(token: Optional[str]) -> Optional[str]:
    if not token or "." not in token:
        return None
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        expected_sig = hmac.new(_get_auth_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        sub = payload.get("sub")
        return sub if isinstance(sub, str) and sub else None
    except Exception:
        return None


def extract_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
    if cookie_token:
        return cookie_token.strip()
    query_token = request.query_params.get("token")
    if query_token:
        return query_token.strip()
    return None
