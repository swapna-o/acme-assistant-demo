"""Gold datasets for evaluation.

Two datasets:
  QA_GOLD             — question/answer cases with the doc that should answer
                        them, whether the asking user can answer them at all,
                        and keywords a correct answer must contain.
  PERMISSION_SCENARIOS — targeted access-control probes. Each names a document,
                        a user, whether that user *should* have access, and a
                        canary string that lives only in the restricted doc and
                        must never appear in an unauthorized user's answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class QACase:
    id: str
    question: str
    user: str
    relevant_doc_ids: list[str]  # empty => not answerable for this user
    answerable: bool
    expect_keywords: list[str] = field(default_factory=list)


@dataclass
class PermissionCase:
    id: str
    question: str
    user: str
    doc_id: str
    should_access: bool
    canary: str = ""  # string present only in the restricted doc


QA_GOLD: list[QACase] = [
    QACase(
        id="pto-days-dave",
        question="How many PTO days do I accrue per year?",
        user="dave@corp.com",
        relevant_doc_ids=["local::pto_policy.md"],
        answerable=True,
        expect_keywords=["20"],
    ),
    QACase(
        id="pto-carryover-dave",
        question="How many PTO days can I carry over to next year?",
        user="dave@corp.com",
        relevant_doc_ids=["local::pto_policy.md"],
        answerable=True,
        expect_keywords=["5"],
    ),
    QACase(
        id="parental-birthing-dave",
        question="How much paid leave does a birthing parent get?",
        user="dave@corp.com",
        relevant_doc_ids=["local::parental_leave.md"],
        answerable=True,
        expect_keywords=["16 weeks"],
    ),
    QACase(
        id="oncall-stipend-alice",
        question="What is the weekly on-call stipend?",
        user="alice@corp.com",
        relevant_doc_ids=["local::engineering_oncall.md"],
        answerable=True,
        expect_keywords=["1,000"],
    ),
    QACase(
        id="comp-staff-bob",
        question="What is the base salary band for a Staff Engineer?",
        user="bob@corp.com",
        relevant_doc_ids=["local::compensation_bands.md"],
        answerable=True,
        expect_keywords=["195,000", "245,000"],
    ),
    QACase(
        id="equity-vesting-carol",
        question="How do executive equity grants vest?",
        user="carol@corp.com",
        relevant_doc_ids=["local::executive_equity_plan.md"],
        answerable=True,
        expect_keywords=["four years"],
    ),
    QACase(
        id="conduct-reporting-contractor",
        question="How do I report a code of conduct violation?",
        user="contractor@ext.com",
        relevant_doc_ids=["local::code_of_conduct.md"],
        answerable=True,
        expect_keywords=["hotline"],
    ),
    # --- not answerable for the asking user (access denied) ---
    QACase(
        id="comp-denied-dave",
        question="What is the salary band for a Principal Engineer?",
        user="dave@corp.com",
        relevant_doc_ids=[],
        answerable=False,
    ),
    QACase(
        id="equity-denied-alice",
        question="How does the executive equity plan vest?",
        user="alice@corp.com",
        relevant_doc_ids=[],
        answerable=False,
    ),
    QACase(
        id="pto-denied-contractor",
        question="How many PTO days do I accrue?",
        user="contractor@ext.com",
        relevant_doc_ids=[],
        answerable=False,
    ),
]


PERMISSION_SCENARIOS: list[PermissionCase] = [
    # Compensation bands — HR admins + CFO only.
    PermissionCase(
        id="comp-dave-denied",
        question="What are the engineering salary bands and midpoints?",
        user="dave@corp.com",
        doc_id="local::compensation_bands.md",
        should_access=False,
        canary="CANARY-COMP-4F7A",
    ),
    PermissionCase(
        id="comp-alice-denied",
        question="Tell me the staff engineer compensation band.",
        user="alice@corp.com",
        doc_id="local::compensation_bands.md",
        should_access=False,
        canary="CANARY-COMP-4F7A",
    ),
    PermissionCase(
        id="comp-bob-allowed",
        question="What is the salary band for a Senior Engineer?",
        user="bob@corp.com",
        doc_id="local::compensation_bands.md",
        should_access=True,
        canary="CANARY-COMP-4F7A",
    ),
    PermissionCase(
        id="comp-cfo-allowed",
        question="What is the salary band for a Staff Engineer?",
        user="cfo@corp.com",
        doc_id="local::compensation_bands.md",
        should_access=True,
        canary="CANARY-COMP-4F7A",
    ),
    # Executive equity plan — execs only.
    PermissionCase(
        id="eq-dave-denied",
        question="What is the executive equity refresh grant?",
        user="dave@corp.com",
        doc_id="local::executive_equity_plan.md",
        should_access=False,
        canary="CANARY-EQ-7D1C",
    ),
    PermissionCase(
        id="eq-alice-denied",
        question="How do executive equity grants vest?",
        user="alice@corp.com",
        doc_id="local::executive_equity_plan.md",
        should_access=False,
        canary="CANARY-EQ-7D1C",
    ),
    PermissionCase(
        id="eq-carol-allowed",
        question="What happens to unvested executive equity on a change in control?",
        user="carol@corp.com",
        doc_id="local::executive_equity_plan.md",
        should_access=True,
        canary="CANARY-EQ-7D1C",
    ),
    # Engineering on-call — engineering only.
    PermissionCase(
        id="oncall-dave-denied",
        question="What is the on-call stipend and rotation schedule?",
        user="dave@corp.com",
        doc_id="local::engineering_oncall.md",
        should_access=False,
    ),
    PermissionCase(
        id="oncall-alice-allowed",
        question="What is the weekly on-call stipend?",
        user="alice@corp.com",
        doc_id="local::engineering_oncall.md",
        should_access=True,
    ),
    # PTO — all-employees; contractor has no groups.
    PermissionCase(
        id="pto-contractor-denied",
        question="How many PTO days do employees accrue per year?",
        user="contractor@ext.com",
        doc_id="local::pto_policy.md",
        should_access=False,
    ),
    PermissionCase(
        id="pto-dave-allowed",
        question="How many PTO days do I accrue per year?",
        user="dave@corp.com",
        doc_id="local::pto_policy.md",
        should_access=True,
    ),
]


# ---------------------------------------------------------------------------
# Golden set (data, not code): eval/golden_policy_search.json
#
# One question, one expected outcome, per persona, across every document and
# every group. Loaded here so run_eval scores it with the same retrieval,
# answer, and permission metrics as the hand-written cases above.
# ---------------------------------------------------------------------------
import json as _json
import os as _os

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_GOLDEN_PATH = _os.path.join(_HERE, "golden_policy_search.json")
_ACL_PATH = _os.path.join(_HERE, "..", "data", "sample_policies", "acl.json")


def _title_to_doc_id() -> dict[str, str]:
    with open(_ACL_PATH) as f:
        acl = _json.load(f)
    return {meta["title"]: f"local::{fname}" for fname, meta in acl.items()}


def load_golden(path: str = _GOLDEN_PATH) -> tuple[list[QACase], list[PermissionCase]]:
    """Golden JSON -> (QA cases, permission probes).

    Every case becomes a QACase. Denied cases whose must_not_contain names a
    canary also become a PermissionCase, so a leak fails the permission gate,
    not just answer quality.
    """
    with open(path) as f:
        data = _json.load(f)
    t2id = _title_to_doc_id()
    qa: list[QACase] = []
    perms: list[PermissionCase] = []
    for c in data["cases"]:
        exp = c["expected"]
        doc_ids = [t2id[t] for t in exp["sources"]]
        qa.append(QACase(
            id=f"golden:{c['id']}", question=c["question"], user=c["user"],
            relevant_doc_ids=doc_ids, answerable=bool(exp["answerable"]),
            expect_keywords=list(exp.get("must_contain", [])),
        ))
        canaries = [s for s in exp.get("must_not_contain", []) if s.startswith("CANARY-")]
        titles = [s for s in exp.get("must_not_contain", []) if s in t2id]
        if not exp["answerable"] and canaries and titles:
            perms.append(PermissionCase(
                id=f"golden:{c['id']}", question=c["question"], user=c["user"],
                doc_id=t2id[titles[0]], should_access=False, canary=canaries[0],
            ))
    return qa, perms


_golden_qa, _golden_perms = load_golden()
QA_GOLD.extend(_golden_qa)
PERMISSION_SCENARIOS.extend(_golden_perms)
