"""In-memory vector store with ACL pre-filtering.

The security-critical method is `search`: it filters candidate chunks by the
caller's `Principal` BEFORE scoring and ranking. Inaccessible chunks are never
considered, so they can never be returned to the retriever or surfaced to the
model. This is the correct posture — filter-then-retrieve, not
retrieve-then-filter.
"""

from __future__ import annotations

import json

import numpy as np

from .models import Chunk, Principal


class InMemoryVectorStore:
    def __init__(self, dim: int):
        self.dim = dim
        self.chunks: list[Chunk] = []
        self._matrix = np.zeros((0, dim), dtype=np.float32)

    def add(self, chunks: list[Chunk]) -> None:
        vecs = []
        for c in chunks:
            if c.embedding is None:
                raise ValueError(f"chunk {c.id} has no embedding")
            vecs.append(c.embedding)
        if not vecs:
            return
        new = np.array(vecs, dtype=np.float32)
        self._matrix = np.vstack([self._matrix, new]) if len(self.chunks) else new
        self.chunks.extend(chunks)

    def search(
        self, query_vec: np.ndarray, principal: Principal, k: int
    ) -> list[tuple[Chunk, float]]:
        """Return up to k (chunk, score) pairs the principal is allowed to see."""
        if not self.chunks:
            return []

        # --- ACL pre-filter: this is the enforcement point ---
        allowed_idx = [
            i for i, c in enumerate(self.chunks) if c.acl.permits(principal)
        ]
        if not allowed_idx:
            return []

        sub = self._matrix[allowed_idx]
        scores = sub @ query_vec.reshape(-1)  # cosine sim (vectors are normalized)
        order = np.argsort(-scores)[:k]
        return [(self.chunks[allowed_idx[j]], float(scores[j])) for j in order]

    # --- persistence ---
    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(
                {
                    "dim": self.dim,
                    "chunks": [c.to_dict(include_embedding=True) for c in self.chunks],
                },
                f,
            )

    @classmethod
    def load(cls, path: str) -> "InMemoryVectorStore":
        with open(path) as f:
            data = json.load(f)
        store = cls(dim=data["dim"])
        chunks = [Chunk.from_dict(d) for d in data["chunks"]]
        store.add(chunks)
        return store
