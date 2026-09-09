"""Run the full evaluation suite and print a report.

Usage:
    python -m eval.run_eval [--judge] [--policies DIR] [--users FILE]

--judge enables the optional LLM-as-judge faithfulness score (needs Claude
credentials). Everything else runs offline with the local embedder.
"""

from __future__ import annotations

import argparse
import os

from rag.connectors import LocalFolderConnector
from rag.directory import UserDirectory
from rag.system import RagSystem

from .datasets import PERMISSION_SCENARIOS, QA_GOLD
from .metrics import (
    evaluate_answers,
    evaluate_permissions,
    evaluate_retrieval,
)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_system(policies_dir: str) -> RagSystem:
    system = RagSystem()
    connector = LocalFolderConnector(policies_dir)
    n = system.ingest_connectors([connector])
    print(f"Ingested {n} chunks from {policies_dir}\n")
    return system


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge", action="store_true", help="LLM faithfulness judge")
    parser.add_argument(
        "--policies", default=os.path.join(HERE, "data", "sample_policies")
    )
    parser.add_argument("--users", default=os.path.join(HERE, "data", "users.json"))
    args = parser.parse_args()

    system = build_system(args.policies)
    directory = UserDirectory.from_json(args.users)
    k = system.config.top_k

    # --- Retrieval ---
    rr = evaluate_retrieval(system, directory, QA_GOLD, k)
    print("=" * 64)
    print("RETRIEVAL")
    print("=" * 64)
    print(f"  recall@{rr.k}:             {rr.recall_at_k:.2f}  (n={rr.n_answerable})")
    print(f"  precision@{rr.k}:          {rr.precision_at_k:.2f}")
    print(f"  MRR:                   {rr.mrr:.2f}")
    print(
        f"  unanswerable handled:  {rr.unanswerable_correct:.2f}  "
        f"(n={rr.n_unanswerable})"
    )

    # --- Answer quality ---
    ar = evaluate_answers(system, directory, QA_GOLD, judge=args.judge)
    print("\n" + "=" * 64)
    print("ANSWER QUALITY")
    print("=" * 64)
    print(
        f"  keyword accuracy:      {ar.keyword_accuracy:.2f}  "
        f"(n={ar.n_answerable} answerable)"
    )
    print(
        f"  abstention accuracy:   {ar.abstention_accuracy:.2f}  "
        f"(n={ar.n_unanswerable} unanswerable)"
    )
    if ar.faithfulness is not None:
        print(f"  faithfulness (judge):  {ar.faithfulness:.2f}")
    for f in ar.failures:
        print(f"    ! {f}")

    # --- Permission enforcement ---
    pr = evaluate_permissions(system, directory, PERMISSION_SCENARIOS)
    print("\n" + "=" * 64)
    print("PERMISSION ENFORCEMENT")
    print("=" * 64)
    print(f"  deny cases:            {pr.n_deny_cases}")
    print(f"  allow cases:           {pr.n_allow_cases}")
    print(f"  retrieval leaks:       {pr.retrieval_leaks}   (must be 0)")
    print(f"  answer leaks (canary): {pr.answer_leaks}   (must be 0)")
    print(f"  false denials:         {pr.false_denials}   (must be 0)")
    for f in pr.failures:
        print(f"    ! {f}")
    print("\n  RESULT:", "PASS ✅" if pr.passed else "FAIL ❌")

    return 0 if pr.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
