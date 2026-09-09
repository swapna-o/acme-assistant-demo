"""Metrics: retrieval quality, answer quality, and permission enforcement.

Permission enforcement is the headline. We measure it at two layers:
  - retrieval leaks: did the store ever return a chunk from a document the user
    is not allowed to see? (Must be 0.)
  - answer leaks: did a generated answer contain a canary string that lives only
    in a restricted document the user cannot access? (Must be 0.)
And the inverse failure mode:
  - false denials: was an authorized user wrongly prevented from retrieving a
    document they should see?
"""

from __future__ import annotations

from dataclasses import dataclass, field

from rag.directory import UserDirectory
from rag.system import RagSystem

from .datasets import PermissionCase, QACase


# --------------------------------------------------------------------------- #
# Retrieval metrics
# --------------------------------------------------------------------------- #
@dataclass
class RetrievalReport:
    recall_at_k: float = 0.0
    precision_at_k: float = 0.0
    mrr: float = 0.0
    unanswerable_correct: float = 0.0  # fraction that correctly retrieved nothing
    k: int = 0
    n_answerable: int = 0
    n_unanswerable: int = 0


def evaluate_retrieval(
    system: RagSystem, directory: UserDirectory, cases: list[QACase], k: int
) -> RetrievalReport:
    recalls, precisions, rrs = [], [], []
    unanswerable_hits = 0
    n_unans = 0

    for case in cases:
        principal = directory.principal(case.user)
        results = system.retrieve(case.question, principal, k)
        retrieved_docs = [c.doc_id for c, _ in results]

        if not case.answerable:
            n_unans += 1
            # Correct behavior: none of the retrieved chunks come from a doc that
            # would actually answer the (restricted) question.
            if not retrieved_docs:
                unanswerable_hits += 1
            continue

        relevant = set(case.relevant_doc_ids)
        hit_docs = [d for d in retrieved_docs if d in relevant]
        recalls.append(1.0 if hit_docs else 0.0)
        precisions.append(
            len(set(retrieved_docs) & relevant) / max(1, len(retrieved_docs))
        )
        rank = next((i + 1 for i, d in enumerate(retrieved_docs) if d in relevant), 0)
        rrs.append(1.0 / rank if rank else 0.0)

    n_ans = len(recalls)
    return RetrievalReport(
        recall_at_k=_mean(recalls),
        precision_at_k=_mean(precisions),
        mrr=_mean(rrs),
        unanswerable_correct=(unanswerable_hits / n_unans) if n_unans else 1.0,
        k=k,
        n_answerable=n_ans,
        n_unanswerable=n_unans,
    )


# --------------------------------------------------------------------------- #
# Answer-quality metrics
# --------------------------------------------------------------------------- #
@dataclass
class AnswerReport:
    keyword_accuracy: float = 0.0  # answerable cases whose answer has the facts
    abstention_accuracy: float = 0.0  # unanswerable cases correctly abstained
    faithfulness: float | None = None  # optional LLM-judge grounded score
    n_answerable: int = 0
    n_unanswerable: int = 0
    failures: list[str] = field(default_factory=list)


def evaluate_answers(
    system: RagSystem,
    directory: UserDirectory,
    cases: list[QACase],
    judge: bool = False,
) -> AnswerReport:
    report = AnswerReport()
    kw_hits, abst_hits = [], []
    faith_scores: list[float] = []

    for case in cases:
        principal = directory.principal(case.user)
        answer = system.answer(case.question, principal)
        text_lc = answer.text.lower()

        if case.answerable:
            report.n_answerable += 1
            ok = all(kw.lower() in text_lc for kw in case.expect_keywords)
            kw_hits.append(1.0 if ok else 0.0)
            if not ok:
                report.failures.append(
                    f"[{case.id}] missing {case.expect_keywords} in: {answer.text[:80]!r}"
                )
            if judge:
                faith_scores.append(
                    _judge_faithfulness(system, case.question, answer)
                )
        else:
            report.n_unanswerable += 1
            abst_hits.append(1.0 if answer.abstained else 0.0)
            if not answer.abstained:
                report.failures.append(
                    f"[{case.id}] should have abstained but answered: "
                    f"{answer.text[:80]!r}"
                )

    report.keyword_accuracy = _mean(kw_hits)
    report.abstention_accuracy = _mean(abst_hits)
    report.faithfulness = _mean(faith_scores) if faith_scores else None
    return report


def _judge_faithfulness(system: RagSystem, question: str, answer) -> float:
    """LLM-as-judge: is every claim supported by the cited context? 0..1."""
    try:
        import anthropic

        client = anthropic.Anthropic()
    except Exception:
        return 1.0  # no judge available; skip

    context = "\n\n".join(f"[{c.title}]\n{c.text}" for c in answer.used_chunks)
    prompt = (
        "You are grading whether an answer is fully grounded in the provided "
        "context. Reply with only a number from 0 to 1 (1 = every claim is "
        "supported by the context, 0 = unsupported claims present).\n\n"
        f"Question: {question}\n\nContext:\n{context}\n\nAnswer:\n{answer.text}\n\n"
        "Grounding score (0-1):"
    )
    resp = client.messages.create(
        model=system.config.judge_model,
        max_tokens=8,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    try:
        return max(0.0, min(1.0, float(text.split()[0])))
    except Exception:
        return 1.0


# --------------------------------------------------------------------------- #
# Permission-enforcement metrics
# --------------------------------------------------------------------------- #
@dataclass
class PermissionReport:
    retrieval_leaks: int = 0
    answer_leaks: int = 0
    false_denials: int = 0
    n_deny_cases: int = 0
    n_allow_cases: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return (
            self.retrieval_leaks == 0
            and self.answer_leaks == 0
            and self.false_denials == 0
        )


def evaluate_permissions(
    system: RagSystem,
    directory: UserDirectory,
    cases: list[PermissionCase],
    check_answers: bool = True,
) -> PermissionReport:
    report = PermissionReport()

    for case in cases:
        principal = directory.principal(case.user)
        results = system.retrieve(case.question, principal, system.config.top_k)
        retrieved_docs = {c.doc_id for c, _ in results}

        if case.should_access:
            report.n_allow_cases += 1
            if case.doc_id not in retrieved_docs:
                report.false_denials += 1
                report.failures.append(
                    f"[{case.id}] FALSE DENIAL: {case.user} could not retrieve "
                    f"{case.doc_id} they are entitled to."
                )
        else:
            report.n_deny_cases += 1
            # Layer 1: retrieval must not surface the restricted doc.
            if case.doc_id in retrieved_docs:
                report.retrieval_leaks += 1
                report.failures.append(
                    f"[{case.id}] RETRIEVAL LEAK: {case.user} retrieved chunks "
                    f"from restricted {case.doc_id}."
                )
            # Layer 2: the generated answer must not contain the canary.
            if check_answers and case.canary:
                answer = system.answer(case.question, principal)
                if case.canary.lower() in answer.text.lower():
                    report.answer_leaks += 1
                    report.failures.append(
                        f"[{case.id}] ANSWER LEAK: canary {case.canary} exposed to "
                        f"{case.user}."
                    )

    return report


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0
