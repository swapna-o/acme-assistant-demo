"""Pluggable text embedders.

- LocalHashingEmbedder: deterministic, dependency-free, offline. Uses signed
  feature hashing over word + character trigrams. Good enough for demos, tests,
  and running the eval without any API keys.
- VoyageEmbedder: production-quality embeddings (Anthropic recommends Voyage AI
  for embeddings; the Claude API itself has no embeddings endpoint).
- SentenceTransformerEmbedder: local neural embeddings if you have the package.

Select via Config.embedder.
"""

from __future__ import annotations

import hashlib
import re
from typing import Protocol

import numpy as np

from .config import Config


class Embedder(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> np.ndarray:  # (n, dim), L2-normalized
        ...


def _l2_normalize(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms


class LocalHashingEmbedder:
    """Offline signed feature-hashing embedder (stable across processes)."""

    def __init__(self, dim: int = 768):
        self.dim = dim

    @staticmethod
    def _tokens(text: str) -> list[str]:
        text = text.lower()
        words = re.findall(r"[a-z0-9]+", text)
        toks: list[str] = []
        for w in words:
            toks.append(w)
            padded = f"#{w}#"
            for i in range(len(padded) - 2):
                toks.append(padded[i : i + 3])  # char trigram
        return toks

    def embed(self, texts: list[str]) -> np.ndarray:
        vecs = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, text in enumerate(texts):
            for tok in self._tokens(text):
                h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
                idx = h % self.dim
                sign = 1.0 if (h // self.dim) % 2 == 0 else -1.0
                vecs[i, idx] += sign
        return _l2_normalize(vecs)


class VoyageEmbedder:
    """voyage-3 style embeddings via the voyageai SDK (needs VOYAGE_API_KEY)."""

    def __init__(self, model: str = "voyage-3"):
        import voyageai  # lazy import

        self.client = voyageai.Client()
        self.model = model
        self.dim = 1024  # voyage-3 default output dim

    def embed(self, texts: list[str]) -> np.ndarray:
        # Voyage supports input_type; we embed documents and queries the same way
        # here for simplicity. For best quality, pass input_type per call site.
        resp = self.client.embed(texts, model=self.model)
        return _l2_normalize(np.array(resp.embeddings, dtype=np.float32))


class SentenceTransformerEmbedder:
    """Local neural embeddings via sentence-transformers (optional dependency)."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        from sentence_transformers import SentenceTransformer  # lazy import

        self.model = SentenceTransformer(model_name)
        self.dim = self.model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> np.ndarray:
        vecs = self.model.encode(texts, convert_to_numpy=True)
        return _l2_normalize(vecs.astype(np.float32))


def get_embedder(config: Config) -> Embedder:
    if config.embedder == "voyage":
        return VoyageEmbedder(config.voyage_model)
    if config.embedder in ("sentence-transformers", "st"):
        return SentenceTransformerEmbedder(config.st_model)
    return LocalHashingEmbedder(config.embed_dim)
