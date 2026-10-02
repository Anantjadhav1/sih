"""
Digital signatures on ledger records.

A hash proves a record hasn't changed since it was sealed. A signature proves
WHO sealed it: only the holder of a private key can produce a signature that
the matching public key accepts, and the signature only fits the exact
contents that were signed. Change one number and it no longer fits.

How it is used here, in three steps:

  1. KEYS      Every account has a key pair (Ed25519, a standard modern
               signature scheme). The public halves are written into the
               ledger's first block, so anyone can look them up and nobody can
               quietly swap one later.
  2. SIGN      When an official approves a policy, the record is signed with
               the official's private key before it is mined into a block.
  3. VERIFY    Every office re-checks the signature against the public key in
               the first block. A forger who edits a record and re-mines the
               hashes still can't make the signature fit without the key.

Demo shortcut, stated plainly: the server derives each account's private key
from its own secret, so it signs on the account's behalf. In production the
key would live on the official's Digital Signature Certificate (DSC) token
and never leave it; the verifying side below would not change at all.
"""

from __future__ import annotations

import hashlib
import hmac
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ALGORITHM = "Ed25519"


def signed_bytes(data: dict) -> bytes:
    """
    Exactly what gets signed: the record without its own signature field,
    serialised with sorted keys so the same record always gives the same bytes.
    """
    unsigned = {k: v for k, v in data.items() if k != "signature"}
    return json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode("utf-8")


class KeyRing:
    """Private keys for the demo accounts, derived from the server secret."""

    def __init__(self, secret: bytes):
        self._secret = secret

    def _private_key(self, username: str) -> Ed25519PrivateKey:
        # 32 bytes unique to this account, reproducible across restarts
        seed = hmac.new(self._secret, b"ledger-signing-key:" + username.encode("utf-8"), hashlib.sha256).digest()
        return Ed25519PrivateKey.from_private_bytes(seed)

    def public_key(self, username: str) -> str:
        raw = self._private_key(username).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        return raw.hex()

    def sign(self, username: str, data: dict) -> dict:
        """The record with a signature attached, ready to be mined into a block."""
        value = self._private_key(username).sign(signed_bytes(data)).hex()
        return {**data, "signature": {"signer": username, "algorithm": ALGORITHM, "value": value}}


def signature_valid(public_key_hex: str, data: dict) -> bool:
    """Does the record's signature fit its contents and this public key?"""
    sig = data.get("signature")
    if not isinstance(sig, dict):
        return False
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(sig.get("value", "")), signed_bytes(data))
        return True
    except (InvalidSignature, ValueError):
        return False
