"""User directory: resolves an email into a Principal with group memberships.

In production this would be backed by your IdP (Okta, Entra ID, Google
Workspace groups). Here it's a JSON file mapping email -> list of groups.
"""

from __future__ import annotations

import json

from .models import Principal


class UserDirectory:
    def __init__(self, user_groups: dict[str, list[str]]):
        self._user_groups = {k: frozenset(v) for k, v in user_groups.items()}

    def principal(self, email: str) -> Principal:
        return Principal(email=email, groups=self._user_groups.get(email, frozenset()))

    def emails(self) -> list[str]:
        return sorted(self._user_groups)

    @classmethod
    def from_json(cls, path: str) -> "UserDirectory":
        with open(path) as f:
            return cls(json.load(f))
