"""Connector interface.

A connector's job is two-fold:
  1. Fetch document text from a source system.
  2. Faithfully translate that system's *native permissions* into an `ACL`.

Point 2 is what makes permission-aware answering possible: the ACL we store is
derived from the real sharing settings in Drive / SharePoint, not hand-authored.
"""

from __future__ import annotations

from typing import Iterable, Protocol

from ..models import Document


class Connector(Protocol):
    source_name: str

    def fetch(self) -> Iterable[Document]:
        ...
