"""Ask a question as a specific user, against the persisted index.

The answer is permission-aware: you only get information from documents the
named user is allowed to see.

Examples:
    python -m scripts.ask --user dave@corp.com  "How many PTO days do I get?"
    python -m scripts.ask --user bob@corp.com   "Staff engineer salary band?"
    python -m scripts.ask --user dave@corp.com   "How do executive equity grants vest?"
"""

from __future__ import annotations

import argparse
import os

from rag.directory import UserDirectory
from rag.system import RagSystem

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--user", required=True, help="email of the asking user")
    p.add_argument("question", help="the question to ask")
    p.add_argument("--index", default=os.path.join(HERE, "index.json"))
    p.add_argument("--users", default=os.path.join(HERE, "data", "users.json"))
    p.add_argument("--show-sources", action="store_true")
    args = p.parse_args()

    system = RagSystem()
    if not os.path.exists(args.index):
        print(f"No index at {args.index}. Run:  python -m scripts.ingest")
        return 1
    system.load(args.index)

    directory = UserDirectory.from_json(args.users)
    principal = directory.principal(args.user)

    answer = system.answer(args.question, principal)
    print(f"\nUser:     {principal.email}  (groups: {', '.join(sorted(principal.groups)) or 'none'})")
    print(f"Question: {args.question}\n")
    print(answer.text)
    if args.show_sources and answer.source_titles:
        print("\nSources:", ", ".join(answer.source_titles))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
