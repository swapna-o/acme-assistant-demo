"""Split documents into overlapping chunks that inherit the document ACL."""

from __future__ import annotations

import re

from .models import Chunk, Document


def _split_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Paragraph-aware character chunking with overlap.

    We first pack whole paragraphs up to ~chunk_size, then hard-split any
    paragraph that is itself larger than chunk_size. Overlap keeps a tail of
    the previous chunk so facts spanning a boundary stay retrievable.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""

    def flush():
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(para) > chunk_size:
            flush()
            start = 0
            while start < len(para):
                chunks.append(para[start : start + chunk_size].strip())
                start += max(1, chunk_size - overlap)
            continue
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
        else:
            flush()
            current = para
    flush()

    # Add overlap between adjacent packed chunks.
    if overlap > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for prev, cur in zip(chunks, chunks[1:]):
            tail = prev[-overlap:]
            overlapped.append(f"{tail}\n\n{cur}".strip())
        chunks = overlapped

    return chunks


def chunk_document(doc: Document, chunk_size: int, overlap: int) -> list[Chunk]:
    pieces = _split_text(doc.text, chunk_size, overlap)
    out: list[Chunk] = []
    for i, piece in enumerate(pieces):
        out.append(
            Chunk(
                id=f"{doc.id}::chunk::{i}",
                doc_id=doc.id,
                title=doc.title,
                text=piece,
                acl=doc.acl,  # ACL flows from document to every chunk
                source=doc.source,
                uri=doc.uri,
                ordinal=i,
            )
        )
    return out
