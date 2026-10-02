"""
A small, real blockchain for sealing land-policy decisions and citizen photos.

Why a blockchain here: once an official approves a land-use change, nobody -
not even an administrator with database access - should be able to quietly
rewrite what was approved, the risk numbers it was approved on, or who
approved it.

What makes this a blockchain, in six ideas:

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
                    once; a forger must pay it again for every later block.
  5. SIGNATURE      Every record is signed with its author's private key
                    (signing.py). The public keys are in the first block, so
                    anyone can check who sealed what - and a forger who edits
                    a record cannot re-sign it without the author's key.
  6. CONSENSUS      Three offices - central, state and district - each keep
                    their own copy. A new block is only added when a majority
                    of them check it and accept it, and whenever the copies
                    differ, the version most offices hold is the true one. An
                    insider who controls one office is simply outvoted.

On top of that sit RULES every office enforces before accepting a block -
the same idea as a smart contract: only officials may sign policy
decisions, and approving a High-risk policy needs a written reason.

What is simplified: the three offices run inside this one server so the
demo can show all of them side by side. In production each runs on its own
office's server and they talk over the network; the checks are identical.
"""

from __future__ import annotations

import copy
import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from signing import signature_valid

# Hashes must start with this many zeros. 3 means ~4,096 attempts per block:
# fast enough to mine instantly in a demo, slow enough to show real work.
DIFFICULTY = 3

GENESIS_PREVIOUS_HASH = "0" * 64

# The offices that each hold a copy of the ledger
OFFICES = (
    ("central", "Central ministry office"),
    ("state", "State revenue office"),
    ("district", "District collector's office"),
)

# Approving a High-risk policy without explaining why is refused by every office
MIN_REASON_CHARS = 20

RULE_BOOK = [
    "Every record after the first block must be signed by an account listed in the first block.",
    "Only government officials may sign policy decisions.",
    f"Approving a High-risk policy needs a written reason of at least {MIN_REASON_CHARS} characters.",
]


class BlockRejected(Exception):
    """A majority of offices refused a proposed block."""

    def __init__(self, message: str, votes: list[dict]):
        super().__init__(message)
        self.votes = votes


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


def make_block(index: int, data: dict, previous_hash: str, timestamp: str | None = None) -> dict:
    timestamp = timestamp or _now()
    nonce, h = mine(index, timestamp, data, previous_hash)
    return {
        "index": index,
        "timestamp": timestamp,
        "data": data,
        "previous_hash": previous_hash,
        "nonce": nonce,
        "hash": h,
    }


# ---------- checking one block, and a whole chain ----------


def _members(chain: list[dict]) -> dict[str, dict]:
    """The registered accounts and their public keys, read from the first block."""
    if not chain:
        return {}
    return {m["username"]: m for m in chain[0]["data"].get("members", [])}


def rule_problem(data: dict, signer: dict | None) -> str | None:
    """The rule book (see RULE_BOOK). None when the record follows every rule."""
    kind = data.get("type")
    if kind == "policy_decision":
        if signer is None or signer.get("role") != "official":
            return "Broke a rule: only government officials may sign policy decisions."
        if data.get("decision") == "approved" and data.get("risk_level") == "High":
            if len(str(data.get("reason", "")).strip()) < MIN_REASON_CHARS:
                return (
                    "Broke a rule: approving a High-risk policy needs a written reason "
                    f"of at least {MIN_REASON_CHARS} characters."
                )
        return None
    if kind == "ground_truth":
        return None
    return "Broke a rule: unknown kind of record."


def check_block(block: dict, expected_previous_hash: str, members: dict[str, dict]) -> dict:
    """
    Every question an office asks about a block, before accepting it and again
    whenever the chain is verified:
      - fingerprint: does recomputing the hash give the stored hash?
      - link:        does it point at the hash of the block before it?
      - work:        does its hash meet the proof-of-work target?
      - signature:   was it signed by a registered account, and does the
                     signature still fit the contents?
      - rules:       does it follow the rule book?
    """
    b = block
    recomputed = compute_hash(b["index"], b["timestamp"], b["data"], b["previous_hash"], b["nonce"])
    fingerprint_ok = recomputed == b["hash"]
    link_ok = b["previous_hash"] == expected_previous_hash
    work_ok = b["hash"].startswith("0" * DIFFICULTY)

    is_genesis = b["index"] == 0
    signer = None
    if is_genesis:
        # The first block is the root of trust: it holds the keys, nobody signs it
        signature_ok = bool(b["data"].get("members"))
    else:
        sig = b["data"].get("signature") or {}
        signer = members.get(sig.get("signer", ""))
        signature_ok = signer is not None and signature_valid(signer["public_key"], b["data"])

    if not fingerprint_ok:
        problem = "Contents were changed after sealing - the fingerprint no longer matches."
    elif not link_ok:
        problem = "Does not point to the block before it - the chain is broken here."
    elif not work_ok:
        problem = "Missing proof of work."
    elif not signature_ok:
        problem = (
            "The first block has no list of accounts and keys."
            if is_genesis
            else "The signature doesn't fit these contents - they were changed by someone "
            "without the signer's private key."
        )
    else:
        problem = None if is_genesis else rule_problem(b["data"], signer)

    return {
        "index": b["index"],
        "fingerprint_ok": fingerprint_ok,
        "link_ok": link_ok,
        "work_ok": work_ok,
        "signature_ok": signature_ok,
        "signer": (signer or {}).get("username"),
        "recomputed_hash": recomputed,
        "problem": problem,
    }


def verify_chain(chain: list[dict]) -> dict:
    """Re-check every block from scratch, oldest first."""
    members = _members(chain)
    report = []
    first_broken = None
    for i, b in enumerate(chain):
        expected_prev = GENESIS_PREVIOUS_HASH if i == 0 else chain[i - 1]["hash"]
        check = check_block(b, expected_prev, members)
        # A block in the wrong place counts as a broken link
        if b["index"] != i and check["problem"] is None:
            check["link_ok"] = False
            check["problem"] = "Does not point to the block before it - the chain is broken here."
        if check["problem"] and first_broken is None:
            first_broken = b["index"]
        report.append(check)
    return {
        "valid": first_broken is None and bool(chain),
        "first_broken_index": first_broken,
        "checked_blocks": len(chain),
        "blocks": report,
    }


# ---------- one office's copy ----------


class Office:
    """One office in the network: a name and its own copy of the chain."""

    def __init__(self, office_id: str, name: str, path: Path):
        self.id = office_id
        self.name = name
        self.path = path
        self.chain: list[dict] = []

    def load(self) -> bool:
        if not self.path.exists():
            return False
        self.chain = json.loads(self.path.read_text(encoding="utf-8"))
        return True

    def save(self) -> None:
        self.path.write_text(json.dumps(self.chain, indent=2), encoding="utf-8")

    def review(self, block: dict) -> str | None:
        """Check a proposed block against this office's own copy. None = accept."""
        tip = self.chain[-1]
        if block["index"] != tip["index"] + 1 or block["previous_hash"] != tip["hash"]:
            return "It doesn't follow on from this office's copy of the chain."
        return check_block(block, tip["hash"], _members(self.chain))["problem"]


# ---------- the network of offices ----------


class Network:
    """
    Three offices, each with a copy, persisted as JSON so they survive a
    restart. Writing goes through propose() - every office reviews the block
    and it is added only with a majority. Reading goes through agreed_chain()
    - the version most offices hold.
    """

    def __init__(self, directory: Path, members: list[dict]):
        directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.offices = [Office(oid, name, directory / f"{oid}.json") for oid, name in OFFICES]

        loaded = [o for o in self.offices if o.load()]
        if not loaded:
            genesis = make_block(
                0,
                {
                    "type": "genesis",
                    "title": "Ledger created",
                    "members": members,
                    "rule_book": RULE_BOOK,
                },
                GENESIS_PREVIOUS_HASH,
            )
            for office in self.offices:
                office.chain = [copy.deepcopy(genesis)]
                office.save()
        else:
            # An office whose copy is missing joins by downloading the agreed one
            agreed = self._consensus()["chain"] or loaded[0].chain
            for office in self.offices:
                if office not in loaded:
                    office.chain = copy.deepcopy(agreed)
                    office.save()

    def _office(self, office_id: str) -> Office:
        for o in self.offices:
            if o.id == office_id:
                return o
        raise ValueError("Unknown office.")

    # ---------- agreement ----------

    def _consensus(self) -> dict:
        """
        Which copy is the true one? Each office checks its own copy; among the
        copies that pass, the one held by a majority wins. Two valid copies are
        identical exactly when their newest hashes match, because every hash
        covers the one before it.
        """
        reports = {o.id: verify_chain(o.chain) for o in self.offices}
        groups: dict[str, list[Office]] = {}
        for o in self.offices:
            if reports[o.id]["valid"]:
                groups.setdefault(o.chain[-1]["hash"], []).append(o)
        biggest = max(groups.values(), key=len, default=[])
        majority = biggest if len(biggest) * 2 > len(self.offices) else []
        return {
            "reports": reports,
            "majority": [o.id for o in majority],
            "chain": majority[0].chain if majority else None,
        }

    def status(self) -> dict:
        with self._lock:
            c = self._consensus()
            offices = []
            for o in self.offices:
                report = c["reports"][o.id]
                if o.id in c["majority"]:
                    state = "agrees"
                elif not report["valid"]:
                    state = "tampered"
                else:
                    state = "outvoted"
                offices.append(
                    {
                        "id": o.id,
                        "name": o.name,
                        "status": state,
                        "length": len(o.chain),
                        "tip_hash": o.chain[-1]["hash"] if o.chain else None,
                        "chain": copy.deepcopy(o.chain),
                        "verification": report,
                    }
                )
            agreed = c["chain"]
            return {
                "offices": offices,
                "has_majority": agreed is not None,
                "all_agree": len(c["majority"]) == len(self.offices),
                "agreed_chain": copy.deepcopy(agreed) if agreed else [],
                "agreed_verification": verify_chain(agreed) if agreed else verify_chain([]),
            }

    def agreed_chain(self) -> list[dict]:
        with self._lock:
            chain = self._consensus()["chain"]
            return copy.deepcopy(chain) if chain else []

    # ---------- writing ----------

    def propose(self, data: dict) -> tuple[dict, list[dict]]:
        """
        Mine a block on top of the agreed chain and ask every office to accept
        it. Added only if a majority accepts; returns the block and the votes.
        """
        with self._lock:
            agreed = self._consensus()["chain"]
            if agreed is None:
                raise BlockRejected("The offices don't agree on the chain, so nothing can be added.", [])
            tip = agreed[-1]
            block = make_block(tip["index"] + 1, data, tip["hash"])

            votes = []
            for o in self.offices:
                reason = o.review(block)
                votes.append({"office": o.id, "name": o.name, "accepted": reason is None, "reason": reason})
            yes = [v for v in votes if v["accepted"]]

            if len(yes) * 2 <= len(self.offices):
                reasons = sorted({v["reason"] for v in votes if v["reason"]})
                raise BlockRejected(
                    f"Refused by {len(votes) - len(yes)} of {len(votes)} offices: " + " ".join(reasons),
                    votes,
                )
            for o in self.offices:
                if any(v["office"] == o.id and v["accepted"] for v in votes):
                    o.chain.append(copy.deepcopy(block))
                    o.save()
            return copy.deepcopy(block), votes

    # ---------- demo only: an insider attacks one office's copy ----------

    def tamper(self, office_id: str, index: int, attack: str) -> dict:
        """
        DEMO ONLY. A corrupt insider edits ONE office's copy directly on disk.

        edit     change a record's numbers, leave the hash alone.
                 Caught at that block: the fingerprint no longer matches.
        rewrite  change a record's numbers, then re-mine that block and every
                 block after it so all hashes and links look right again.
                 Caught by the signature (the official never signed those
                 numbers) and by the other offices, who outvote this copy.
        erase    delete a record and re-mine everything after it. Every hash,
                 link and signature on this copy checks out - only the other
                 offices, who still hold the record, reveal it.
        """
        if attack not in ("edit", "rewrite", "erase"):
            raise ValueError("Unknown attack.")
        with self._lock:
            target = self._office(office_id)
            c = self._consensus()
            others_bad = [o.name for o in self.offices if o.id != office_id and o.id not in c["majority"]]
            if others_bad:
                raise ValueError(
                    f"Repair the {others_bad[0]} first. In this demo the insider controls one office "
                    "at a time - if most offices were corrupt they could outvote the honest one, "
                    "which is why real networks spread copies across many independent offices."
                )
            chain = target.chain
            if index < 1 or index >= len(chain):
                raise ValueError("Pick a block after the first one.")

            before = copy.deepcopy(chain[index]["data"])
            if attack == "erase":
                del chain[index]
                start = index
            else:
                data = chain[index]["data"]
                # The forgery: make a risky decision look safe
                if "risk_score" in data:
                    data["risk_score"] = round(float(data["risk_score"]) * 0.3, 1)
                    data["risk_level"] = "Low"
                else:
                    data["title"] = str(data.get("title", "")) + " (edited)"
                start = index if attack == "rewrite" else None

            if start is not None:
                # Re-mine from the change onwards so every hash and link fits again
                for i in range(start, len(chain)):
                    b = chain[i]
                    b["index"] = i
                    b["previous_hash"] = chain[i - 1]["hash"]
                    b["nonce"], b["hash"] = mine(i, b["timestamp"], b["data"], b["previous_hash"])

            target.save()
            return {"office": office_id, "index": index, "attack": attack, "before": before}

    def repair(self, office_id: str | None = None) -> list[str]:
        """
        An office that disagrees throws its copy away and downloads the one the
        majority holds - how a real network heals. None repairs every office.
        """
        with self._lock:
            c = self._consensus()
            if c["chain"] is None:
                raise ValueError("No majority to repair from.")
            repaired = []
            for o in self.offices:
                if (office_id is None or o.id == office_id) and o.id not in c["majority"]:
                    o.chain = copy.deepcopy(c["chain"])
                    o.save()
                    repaired.append(o.id)
            return repaired
