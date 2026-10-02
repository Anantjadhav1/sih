"""
Tests for the blockchain network: signing, the office checks, the rule book,
every tamper attack, and repair. Run from the backend folder:

    python -m unittest discover -s tests -v
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from blockchain import BlockRejected, Network, verify_chain  # noqa: E402
from signing import KeyRing, signature_valid  # noqa: E402

KEYS = KeyRing(b"test-secret")
MEMBERS = [
    {"username": "official@test", "name": "Official", "role": "official", "public_key": KEYS.public_key("official@test")},
    {"username": "citizen@test", "name": "Citizen", "role": "public", "public_key": KEYS.public_key("citizen@test")},
]


def decision(risk_level="Moderate", approved=True, reason="", risk_score=40.0):
    return {
        "type": "policy_decision",
        "title": "Approved: test policy",
        "decision": "approved" if approved else "rejected",
        "reason": reason,
        "scope": "Test zone",
        "risk_score": risk_score,
        "risk_level": risk_level,
    }


def photo():
    return {"type": "ground_truth", "title": "Citizen photo", "photo_sha256": "ab" * 32}


class LedgerNetworkTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.net = Network(self.dir, MEMBERS)
        # Genesis + two decisions + one photo
        self.net.propose(KEYS.sign("official@test", decision()))
        self.net.propose(KEYS.sign("official@test", decision(approved=False)))
        self.net.propose(KEYS.sign("citizen@test", photo()))

    def tearDown(self):
        self._tmp.cleanup()

    def office(self, office_id):
        return next(o for o in self.net.status()["offices"] if o["id"] == office_id)

    # ---------- the honest path ----------

    def test_every_office_accepts_and_agrees(self):
        status = self.net.status()
        self.assertTrue(status["all_agree"])
        self.assertEqual(len(status["agreed_chain"]), 4)
        self.assertTrue(status["agreed_verification"]["valid"])
        for o in status["offices"]:
            self.assertEqual(o["status"], "agrees")

    def test_votes_are_reported(self):
        _, votes = self.net.propose(KEYS.sign("official@test", decision()))
        self.assertEqual([v["accepted"] for v in votes], [True, True, True])

    def test_survives_restart(self):
        reloaded = Network(self.dir, MEMBERS)
        self.assertEqual(reloaded.agreed_chain(), self.net.agreed_chain())

    def test_missing_office_downloads_agreed_copy(self):
        (self.dir / "state.json").unlink()
        reloaded = Network(self.dir, MEMBERS)
        self.assertTrue(reloaded.status()["all_agree"])

    # ---------- signatures ----------

    def test_signature_fits_only_the_signed_contents(self):
        signed = KEYS.sign("official@test", decision())
        key = KEYS.public_key("official@test")
        self.assertTrue(signature_valid(key, signed))
        self.assertFalse(signature_valid(key, {**signed, "risk_score": 1.0}))
        self.assertFalse(signature_valid(KEYS.public_key("citizen@test"), signed))

    def test_unsigned_record_is_refused(self):
        with self.assertRaises(BlockRejected):
            self.net.propose(decision())

    def test_unregistered_signer_is_refused(self):
        with self.assertRaises(BlockRejected):
            self.net.propose(KEYS.sign("stranger@test", decision()))

    # ---------- the rule book ----------

    def test_only_officials_may_sign_decisions(self):
        with self.assertRaises(BlockRejected) as caught:
            self.net.propose(KEYS.sign("citizen@test", decision()))
        self.assertIn("only government officials", str(caught.exception))
        self.assertEqual(len(self.net.agreed_chain()), 4)

    def test_high_risk_approval_needs_a_reason(self):
        with self.assertRaises(BlockRejected) as caught:
            self.net.propose(KEYS.sign("official@test", decision(risk_level="High", reason="ok")))
        self.assertIn("written reason", str(caught.exception))
        block, _ = self.net.propose(
            KEYS.sign("official@test", decision(risk_level="High", reason="Flood walls are funded and approved."))
        )
        self.assertEqual(block["index"], 4)

    def test_high_risk_rejection_needs_no_reason(self):
        block, _ = self.net.propose(KEYS.sign("official@test", decision(risk_level="High", approved=False)))
        self.assertEqual(block["index"], 4)

    # ---------- attacks on one office ----------

    def test_edit_is_caught_by_the_fingerprint(self):
        self.net.tamper("district", 1, "edit")
        district = self.office("district")
        self.assertEqual(district["status"], "tampered")
        check = district["verification"]["blocks"][1]
        self.assertFalse(check["fingerprint_ok"])
        # The record everyone else reads is untouched
        self.assertTrue(self.net.status()["agreed_verification"]["valid"])

    def test_rewrite_is_caught_by_the_signature(self):
        self.net.tamper("district", 1, "rewrite")
        district = self.office("district")
        self.assertEqual(district["status"], "tampered")
        check = district["verification"]["blocks"][1]
        # Hashes, links and work all re-done - only the signature gives it away
        self.assertTrue(check["fingerprint_ok"] and check["link_ok"] and check["work_ok"])
        self.assertFalse(check["signature_ok"])

    def test_erase_is_caught_only_by_the_other_offices(self):
        self.net.tamper("district", 2, "erase")
        district = self.office("district")
        # Every check on the district's own copy passes...
        self.assertTrue(district["verification"]["valid"])
        self.assertEqual(district["length"], 3)
        # ...but the other two offices still hold the record and outvote it
        self.assertEqual(district["status"], "outvoted")
        self.assertEqual(len(self.net.agreed_chain()), 4)

    def test_out_of_step_office_refuses_new_blocks(self):
        self.net.tamper("district", 3, "erase")
        _, votes = self.net.propose(KEYS.sign("official@test", decision()))
        self.assertEqual([v["accepted"] for v in votes], [True, True, False])

    def test_only_one_office_can_be_attacked_at_a_time(self):
        self.net.tamper("district", 1, "edit")
        with self.assertRaises(ValueError):
            self.net.tamper("state", 1, "edit")
        # Stacking attacks on the same office is fine
        self.net.tamper("district", 2, "edit")

    def test_repair_downloads_the_majority_copy(self):
        self.net.tamper("district", 1, "rewrite")
        self.assertEqual(self.net.repair("district"), ["district"])
        self.assertTrue(self.net.status()["all_agree"])

    def test_tampered_copy_on_disk_is_caught_after_restart(self):
        self.net.tamper("central", 2, "edit")
        reloaded = Network(self.dir, MEMBERS)
        statuses = {o["id"]: o["status"] for o in reloaded.status()["offices"]}
        self.assertEqual(statuses, {"central": "tampered", "state": "agrees", "district": "agrees"})

    def test_verify_chain_flags_a_block_out_of_place(self):
        chain = self.net.agreed_chain()
        chain[1], chain[2] = chain[2], chain[1]
        self.assertFalse(verify_chain(chain)["valid"])


if __name__ == "__main__":
    unittest.main()
