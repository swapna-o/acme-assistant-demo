"""Score the golden set against the *served* search, the way employees see it.

    python -m eval.run_golden                # against http://localhost:8930
    python -m eval.run_golden --api http://host:port

run_eval.py measures the retrieval engine on its own. This runner posts every
golden case to /api/ask, so the grounding check, the relevance floor, and the
abstention rule are all in the loop. A case passes when:

  answerable:   not abstained, an expected document is among the sources,
                every must_contain string is in the answer text, and no
                forbidden_sources document was retrieved
  not answerable: abstained, no sources, and no must_not_contain string
                appears anywhere in the answer, the sources, or the excerpts
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def ask(api: str, user: str, question: str) -> dict:
    req = urllib.request.Request(
        f"{api}/api/ask", data=json.dumps({"user": user, "question": question}).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def check(case: dict, r: dict) -> list[str]:
    exp = case["expected"]
    answer = r.get("answer", "")
    sources = r.get("sources", []) or []
    haystack = answer + " " + " ".join(sources) + " " + " ".join(x.get("excerpt", "") for x in r.get("retrieved", []) or [])
    problems = []
    if exp["answerable"]:
        if r.get("abstained"):
            problems.append("abstained but should answer")
        if exp["sources"] and not any(s in sources for s in exp["sources"]):
            problems.append(f"sources {sources} lack {exp['sources']}")
        for kw in exp.get("must_contain", []):
            if kw not in answer:
                problems.append(f"missing {kw!r}")
    else:
        if not r.get("abstained"):
            problems.append(f"answered from {sources or 'nothing'} but should abstain")
        if sources:
            problems.append(f"named sources {sources}")
    for kw in exp.get("must_not_contain", []):
        if kw and kw in haystack:
            problems.append(f"leaked {kw!r}")
    for t in exp.get("forbidden_sources", []):
        if t in sources or any(x.get("title") == t for x in r.get("retrieved", []) or []):
            problems.append(f"forbidden source {t!r} was used")
    return problems


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--api", default=os.getenv("RAG_URL", "http://localhost:8930"))
    p.add_argument("--golden", default=os.path.join(HERE, "golden_policy_search.json"))
    p.add_argument("--category", help="run only this category")
    args = p.parse_args()

    data = json.load(open(args.golden))
    cases = [c for c in data["cases"] if not args.category or c["category"] == args.category]
    results, by_cat = [], {}
    for c in cases:
        try:
            r = ask(args.api, c["user"], c["question"])
            problems = check(c, r)
            excerpt = (r.get("answer", "") or "")[:90].replace("\n", " ")
        except Exception as e:  # noqa: BLE001
            problems, excerpt = [f"request failed: {e}"], ""
        ok = not problems
        by_cat.setdefault(c["category"], [0, 0])
        by_cat[c["category"]][0] += 1
        by_cat[c["category"]][1] += ok
        results.append({"id": c["id"], "category": c["category"], "user": c["user"], "question": c["question"], "passed": ok, "problems": problems, "answer": excerpt})
        mark = "ok  " if ok else "FAIL"
        print(f"{mark} [{c['category']:13}] {c['id']:26} {c['user']:18} {'; '.join(problems) if problems else excerpt}")

    passed = sum(r["passed"] for r in results)
    print("\n" + "=" * 64)
    for cat, (n, k) in by_cat.items():
        print(f"  {cat:14} {k}/{n}")
    print(f"  TOTAL          {passed}/{len(results)}  ({100 * passed // max(1, len(results))}%)")
    print("=" * 64)
    os.makedirs(os.path.join(HERE, "reports"), exist_ok=True)
    out = os.path.join(HERE, "reports", f"golden-{time.strftime('%Y-%m-%dT%H-%M-%S')}.json")
    json.dump({"api": args.api, "golden": data["name"], "version": data["version"], "passed": passed, "total": len(results), "by_category": by_cat, "results": results}, open(out, "w"), indent=2)
    print(f"  report: {out}")
    publish_to_site()
    return 0 if passed == len(results) else 1


def publish_to_site() -> None:
    """Refresh the portfolio's copy of the suite and golden set, if the site is here.

    The site keeps snapshots under website/evals/ and renders them on
    work-evals-cases.html; this keeps them from going stale after a run.
    Override the location with SITE_BUILD_SCRIPT, or set it empty to skip."""
    import subprocess
    script = os.environ.get("SITE_BUILD_SCRIPT", os.path.expanduser("~/Resume Tailor 2026/website/build_evals_page.py"))
    if script and os.path.exists(script):
        subprocess.run([sys.executable, script], check=False)


if __name__ == "__main__":
    sys.exit(main())
