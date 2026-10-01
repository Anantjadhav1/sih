"""
A small, real blockchain for sealing approved land-policy decisions.

Why a blockchain here: once an official approves a land-use change, nobody -
not even an administrator with database access - should be able to quietly
rewrite what was approved or the risk numbers it was approved on.

What makes this a blockchain, in four ideas:

  1. BLOCK          One sealed record: the decision, a timestamp, the hash of
                    the previous block, and its own hash.
  2. HASH           A SHA-256 fingerprint of the block's contents. Change a
                    single character and the fingerprint changes completely.
  3. CHAIN          Every block stores the previous block's hash. Edit an old
                    block and its fingerprint changes, so the next block no
                    longer points at it - the chain visibly breaks there.
  4. PROOF OF WORK  A block is only accepted if its hash starts with "000".
                    The computer has to try nonce values until one works
                    (about 4,000 attempts on average). Honest writers pay this
                    once; a forger must pay it again for every block after the
                    one they changed.

What it deliberately leaves out: many computers holding copies and agreeing
on them (a network with consensus), and digital signatures on each record.
Both are the production next step; leaving them out keeps every line here
explainable. The "honest copy" file stands in for the other computers when
we demonstrate recovering from tampering.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

# Hashes must start with this many zeros. 3 means ~4,096 attempts per block:
# fast enough to mine instantly in a demo, slow enough to show real work.
DIFFICULTY = 3

GENESIS_PREVIOUS_HASH = "0" * 64


def compute_hash(index: int, timestamp: str, data: dict, previous_hash: str, nonce: int) -> str:
    """
    The block's fingerprint. Contents are serialised with sorted keys so the
    same block always produces the same text, and therefore the same hash.
    """
    payload = json.dumps(
        {
            "index": index,
            "timestamp": timestamp,
            "data": data,
            "previous_hash": previous_hash,
            "nonce": nonce,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def mine(index: int, timestamp: str, data: dict, previous_hash: str) -> tuple[int, str]:
    """
    Proof of work: try nonce 0, 1, 2, ... until the hash starts with the
    required zeros. Returns the winning nonce and hash.
    """
    target = "0" * DIFFICULTY
    nonce = 0
    while True:
        h = compute_hash(index, timestamp, data, previous_hash, nonce)
        if h.startswith(target):
            return nonce, h
        nonce += 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Blockchain:
    """
    The ledger, persisted as JSON so it survives a server restart.

    `honest_path` is a second copy updated only by legitimate appends. In a
    real network that role is played by every other computer holding the
    ledger; here it lets the demo show tampering being detected and undone.
    """

    def __init__(self, path: Path, honest_path: Path):
        self.path = path
        self.honest_path = honest_path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

        if self.path.exists():
            self.blocks: list[dict] = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.blocks = [self._make_block(0, {"type": "genesis", "title": "Ledger created"}, GENESIS_PREVIOUS_HASH)]
            self._save(honest=True)

    # ---------- writing ----------

    @staticmethod
    def _make_block(index: int, data: dict, previous_hash: str) -> dict:
        timestamp = _now()
        nonce, h = mine(index, timestamp, data, previous_hash)
        return {
            "index": index,
            "timestamp": timestamp,
            "data": data,
            "previous_hash": previous_hash,
            "nonce": nonce,
            "hash": h,
        }

    def _save(self, honest: bool) -> None:
        text = json.dumps(self.blocks, indent=2)
        self.path.write_text(text, encoding="utf-8")
        if honest:
            self.honest_path.write_text(text, encoding="utf-8")

    def add(self, data: dict) -> dict:
        """Mine a new block on top of the current last block and append it."""
        with self._lock:
            last = self.blocks[-1]
            block = self._make_block(last["index"] + 1, data, last["hash"])
            self.blocks.append(block)
            self._save(honest=True)
            return block

    # ---------- checking ----------

    def verify(self) -> dict:
        """
        Re-check every block from scratch. Three questions per block:
          - fingerprint: does recomputing the hash give the stored hash?
          - link:        does it point at the actual hash of the block before?
          - work:        does its hash meet the proof-of-work target?
        """
        target = "0" * DIFFICULTY
        report = []
        first_broken = None

        for i, b in enumerate(self.blocks):
            recomputed = compute_hash(b["index"], b["timestamp"], b["data"], b["previous_hash"], b["nonce"])
            fingerprint_ok = recomputed == b["hash"]
            expected_prev = GENESIS_PREVIOUS_HASH if i == 0 else self.blocks[i - 1]["hash"]
            link_ok = b["previous_hash"] == expected_prev
            work_ok = b["hash"].startswith(target)

            if not fingerprint_ok:
                problem = "Contents were changed after sealing - the fingerprint no longer matches."
            elif not link_ok:
                problem = "Does not point to the block before it - the chain is broken here."
            elif not work_ok:
                problem = "Missing proof of work."
            else:
                problem = None

            if problem and first_broken is None:
                first_broken = b["index"]

            report.append(
                {
                    "index": b["index"],
                    "fingerprint_ok": fingerprint_ok,
                    "link_ok": link_ok,
                    "work_ok": work_ok,
                    "recomputed_hash": recomputed,
                    "problem": problem,
                }
            )

        return {
            "valid": first_broken is None,
            "first_broken_index": first_broken,
            "checked_blocks": len(self.blocks),
            "blocks": report,
        }

    # ---------- demo only ----------

    def tamper(self, index: int, reseal: bool) -> dict:
        """
        DEMO ONLY. Simulates a forger editing an old record directly in
        storage, to show that the chain catches it.

        reseal=False  a naive forger: edits the data and leaves the hash.
                      Detected at that block: the fingerprint no longer matches.
        reseal=True   a smarter forger: edits the data, then re-mines the hash
                      so the block looks valid on its own. Detected at the NEXT
                      block, whose stored "previous hash" now points nowhere.
                      Hiding that too would mean re-mining every later block.
        """
        with self._lock:
            if index < 1 or index >= len(self.blocks):
                raise ValueError("Pick a block after the genesis block.")
            b = self.blocks[index]
            before = dict(b["data"])
            # The forgery: make a risky decision look safe
            if "risk_score" in b["data"]:
                b["data"]["risk_score"] = round(float(b["data"]["risk_score"]) * 0.3, 1)
                b["data"]["risk_level"] = "Low"
            else:
                b["data"]["title"] = str(b["data"].get("title", "")) + " (edited)"
            if reseal:
                b["nonce"], b["hash"] = mine(b["index"], b["timestamp"], b["data"], b["previous_hash"])
            self._save(honest=False)
            return {"index": index, "before": before, "after": dict(b["data"]), "resealed": reseal}

    def restore(self) -> None:
        """Replace the local copy with the honest copy - as a network would."""
        with self._lock:
            self.blocks = json.loads(self.honest_path.read_text(encoding="utf-8"))
            self._save(honest=False)

    # ---------- reading ----------

    def snapshot(self) -> list[dict]:
        with self._lock:
            return json.loads(json.dumps(self.blocks))
