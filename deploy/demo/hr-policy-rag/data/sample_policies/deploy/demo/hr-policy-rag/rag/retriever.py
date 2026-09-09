"""Retriever: embed the query and pull ACL-filtered chunks from the store."""

from __future__ import annotations

from .embeddings import Embedder
from .models import Chunk, Principal
from .vectorstore import InMemoryVectorStore


class Retriever:
    def __init__(
        self, embedder: Embedder, store: InMemoryVectorStore, min_relevance: float = 0.0
    ):
        self.embedder = embedder
        self.store = store
        self.min_relevance = min_relevance

    def retrieve(
        self, question: str, principal: Principal, k: int = 6
    ) -> list[tuple[Chunk, float]]:
        query_vec = self.embedder.embed([question])[0]
        results = self.store.search(query_vec, principal, k)
        # Relevance floor: drop chunks too dissimilar to be useful, so the
        # answerer abstains instead of grounding on a loosely-related doc.
        return [(c, s) for c, s in results if s >= self.min_relevance]
