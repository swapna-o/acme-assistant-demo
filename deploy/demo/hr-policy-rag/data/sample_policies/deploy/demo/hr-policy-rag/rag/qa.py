"""Answer generation over ACL-filtered retrieved context.

Two layers of leak protection:
  1. Retrieval already filtered by ACL, so restricted content is not in context.
  2. The system prompt forbids using anything outside the provided context and
     forbids mentioning documents that aren't there — so even if retrieval were
     buggy, the model is instructed never to reveal out-of-context material.

Falls back to a simple extractive answer when no Claude credentials are
available, so the whole system (and the eval) runs offline.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .models import Chunk, Principal

SYSTEM_PROMPT = """You are an HR policy assistant. Answer the employee's question using ONLY the policy excerpts in the Context below.

Rules:
- Base every statement strictly on the provided excerpts. Never use outside knowledge or assumptions.
- After each fact you state, cite the source title in square brackets, e.g. [PTO Policy].
- If the Context does not contain the answer, reply exactly that you don't have a policy document covering that question and suggest contacting HR. Do not guess.
- Never mention, describe, or hint at any policy or document that is not present in the Context.
- Keep the answer concise and factual. Lead with the direct answer."""

NO_CONTEXT_MESSAGE = (
    "I don't have a policy document that covers that question, or you may not "
    "have access to the relevant document. Please contact HR for help."
)


@dataclass
class Answer:
    text: str
    used_chunks: list[Chunk] = field(default_factory=list)
    abstained: bool = False
    model: str = ""

    @property
    def source_titles(self) -> list[str]:
        seen, out = set(), []
        for c in self.used_chunks:
            if c.title not in seen:
                seen.add(c.title)
                out.append(c.title)
        return out


def _build_context(chunks: list[tuple[Chunk, float]]) -> str:
    blocks = []
    for i, (c, score) in enumerate(chunks, start=1):
        blocks.append(f"[{i}] Title: {c.title} (source: {c.source})\n{c.text}")
    return "\n\n---\n\n".join(blocks)


def _get_client():
    try:
        import anthropic

        return anthropic.Anthropic()
    except Exception:
        return None


def _extractive_answer(question: str, chunks: list[tuple[Chunk, float]]) -> str:
    """Offline fallback: return the most relevant excerpt with its citation."""
    top = chunks[0][0]
    snippet = top.text.strip()
    if len(snippet) > 600:
        snippet = snippet[:600].rsplit(" ", 1)[0] + "…"
    return f"{snippet} [{top.title}]"


class AnswerGenerator:
    def __init__(self, config: Config):
        self.config = config
        self._client = _get_client()

    def answer(
        self, question: str, chunks: list[tuple[Chunk, float]], principal: Principal
    ) -> Answer:
        used = [c for c, _ in chunks]

        if not chunks:
            # No accessible context -> abstain without calling the model.
            return Answer(text=NO_CONTEXT_MESSAGE, used_chunks=[], abstained=True)

        if self._client is None:
            text = _extractive_answer(question, chunks)
            return Answer(text=text, used_chunks=used, abstained=False, model="extractive")

        context = _build_context(chunks)
        user_content = f"Question: {question}\n\nContext:\n{context}\n\nAnswer:"
        resp = self._client.messages.create(
            model=self.config.answer_model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        abstained = "contact HR" in text and "don't have" in text.lower()
        return Answer(
            text=text, used_chunks=used, abstained=abstained, model=resp.model
        )
