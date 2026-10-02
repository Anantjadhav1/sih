"""
Sign-in and server-enforced permissions.

How it works, in three steps:

  1. LOGIN     The server checks the password against a salted, slow hash
               (PBKDF2-SHA256) - it never stores the password itself.
  2. PASS      It hands back a signed pass (a token): who you are, your role,
               and when the pass expires, plus a signature made with a secret
               only the server knows (HMAC-SHA256 - a keyed hash).
  3. CHECK     Every write request carries the pass. The server recomputes
               the signature; if anyone edited the pass - say, changed
               "researcher" to "official" - the signature no longer matches
               and the request is refused.

The role therefore comes from the server's own signature, never from
whatever the browser claims. This is the same idea as a JWT, written out in
a few lines so it can be explained; production would use a JWT library and
load accounts from the database instead of the demo list below.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from fastapi import Header, HTTPException

TOKEN_TTL_SECONDS = 8 * 60 * 60  # a working day
_PBKDF2_ROUNDS = 200_000
_SECRET_FILE = Path(__file__).parent / ".auth_secret"


def _load_secret() -> bytes:
    """
    The signing key. Read from AUTH_SECRET if set, otherwise created once and
    kept in a git-ignored file so passes survive a server restart.
    """
    env = os.environ.get("AUTH_SECRET")
    if env:
        return env.encode("utf-8")
    if not _SECRET_FILE.exists():
        _SECRET_FILE.write_text(secrets.token_hex(32), encoding="utf-8")
    return _SECRET_FILE.read_text(encoding="utf-8").strip().encode("utf-8")


_SECRET = _load_secret()


def server_secret() -> bytes:
    """Also seeds the demo accounts' ledger signing keys (see signing.py)."""
    return _SECRET


def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)


# Demo accounts. Only salted hashes are kept in memory; the plain demo
# passwords exist so the login screen can offer one-click sign-in.
_DEMO_ACCOUNTS = [
    ("official@demo", "official-demo", "official", "Government Official"),
    ("researcher@demo", "researcher-demo", "researcher", "Researcher"),
    ("citizen@demo", "citizen-demo", "public", "Public User"),
]
USERS: dict[str, dict] = {}
for _username, _password, _role, _name in _DEMO_ACCOUNTS:
    _salt = secrets.token_bytes(16)
    USERS[_username] = {
        "role": _role,
        "name": _name,
        "salt": _salt,
        "password_hash": _hash_password(_password, _salt),
    }


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload_b64: str) -> str:
    return _b64(hmac.new(_SECRET, payload_b64.encode("ascii"), hashlib.sha256).digest())


def authenticate(username: str, password: str) -> dict | None:
    """Return the user if the password is right, else None."""
    user = USERS.get(username)
    if user is None:
        return None
    attempt = _hash_password(password, user["salt"])
    # compare_digest takes the same time whether it fails early or late
    if not hmac.compare_digest(attempt, user["password_hash"]):
        return None
    return user


def issue_token(username: str) -> tuple[str, int]:
    user = USERS[username]
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    payload = {"sub": username, "role": user["role"], "name": user["name"], "exp": expires_at}
    payload_b64 = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}", expires_at


def verify_token(token: str) -> dict | None:
    """The pass's contents if the signature is genuine and it hasn't expired."""
    try:
        payload_b64, signature = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return None
    try:
        payload = json.loads(_unb64(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: the signed-in user, or 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in first.")
    payload = verify_token(authorization[len("Bearer "):])
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Your sign-in pass is invalid or has expired - please sign in again.",
        )
    return payload
