import base64
import hashlib
import hmac
import json
import os
import threading
import time
from typing import Dict, List, Optional, Tuple
from fastapi import Request

AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "true").lower() not in ("0", "false", "no")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "serra@serrastudio.it").strip().lower()
_DEFAULT_SALT = "assistente-serrastudio-2026"
_DEFAULT_PBKDF2_HASH = "fba99bcc0f174f368551a1a8a41bde2e073b2f821ab19d3f27709e0bf944fee5"

AUTH_COOKIE_NAME = "assistente_token"
TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL_SECONDS", str(7 * 24 * 3600)))

# Rate limiting anti brute-force sul login (max 5 tentativi falliti in 5 minuti per IP)
_LOGIN_WINDOW_SECONDS = 300
_LOGIN_MAX_FAILURES = 5
_LOGIN_LOCKOUT_SECONDS = 300
_login_attempts_lock = threading.Lock()
_login_failures: Dict[str, List[float]] = {}


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first_ip = xff.split(",")[0].strip()
        if first_ip:
            return first_ip
    xri = request.headers.get("x-real-ip", "").strip()
    if xri:
        return xri
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def check_login_rate_limit(client_ip: str) -> Tuple[bool, int]:
    """Restituisce (consentito, secondi_rimanenti_blocco)."""
    now = time.time()
    with _login_attempts_lock:
        recent = [ts for ts in _login_failures.get(client_ip, []) if now - ts < _LOGIN_WINDOW_SECONDS]
        if recent:
            _login_failures[client_ip] = recent
        else:
            _login_failures.pop(client_ip, None)
        if len(recent) >= _LOGIN_MAX_FAILURES:
            oldest_relevant = recent[-_LOGIN_MAX_FAILURES]
            retry_after = max(1, int(_LOGIN_LOCKOUT_SECONDS - (now - oldest_relevant)))
            return False, retry_after
        return True, 0


def record_login_attempt(client_ip: str, success: bool) -> None:
    now = time.time()
    with _login_attempts_lock:
        if success:
            _login_failures.pop(client_ip, None)
            return
        recent = [ts for ts in _login_failures.get(client_ip, []) if now - ts < _LOGIN_WINDOW_SECONDS]
        recent.append(now)
        _login_failures[client_ip] = recent


def _get_auth_secret() -> bytes:
    secret = os.environ.get("AUTH_SECRET") or os.environ.get("ADMIN_PASSWORD") or _DEFAULT_PBKDF2_HASH
    return hashlib.sha256(f"assistente-jwt:{secret}".encode("utf-8")).digest()


def verify_credentials(email: str, password: str) -> bool:
    if not email or not password:
        return False
    normalized_email = email.strip().lower()
    email_ok = hmac.compare_digest(normalized_email, ADMIN_EMAIL)

    salt = os.environ.get("ADMIN_PASSWORD_SALT", _DEFAULT_SALT)
    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()

    env_password = os.environ.get("ADMIN_PASSWORD")
    if env_password:
        expected_env_hash = hashlib.pbkdf2_hmac(
            "sha256",
            env_password.encode("utf-8"),
            salt.encode("utf-8"),
            100_000,
        ).hex()
        password_ok = hmac.compare_digest(computed, expected_env_hash)
    else:
        expected_hash = os.environ.get("ADMIN_PASSWORD_HASH", _DEFAULT_PBKDF2_HASH)
        password_ok = hmac.compare_digest(computed, expected_hash)

    return bool(email_ok and password_ok)


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


def get_bridge_secret() -> str:
    env_secret = os.environ.get("DETTOFATTO_BRIDGE_SECRET", "").strip()
    if env_secret:
        return env_secret
    return hashlib.sha256(b"dettofatto-assistente-bridge-2026-serrastudio").hexdigest()


def verify_bridge_request(request: Request) -> bool:
    """Consente richieste autenticate dal server Next.js di DettoFatto."""
    provided = request.headers.get("X-DettoFatto-Bridge", "").strip()
    if not provided:
        return False
    return hmac.compare_digest(provided, get_bridge_secret())
