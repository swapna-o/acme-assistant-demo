"""SharePoint / OneDrive connector via the Microsoft Graph API.

Pulls files from a SharePoint document library (drive) and maps each item's
sharing permissions onto our `ACL`:

    Graph permission grantedToV2      ->  ACL field
    --------------------------------      ----------------------------------
    link.scope == "anonymous"/"org"   ->  public = True  (org-wide -> group,
                                          see org_is_public)
    grantedToV2.user (email/upn)      ->  allowed_users += email
    grantedToV2.group (displayName)   ->  allowed_groups += group name
    grantedToV2.siteGroup             ->  allowed_groups += site group name

Requires (only when .fetch() is called):
    pip install msal requests
Auth: an Entra ID app registration with Graph application permissions
    Sites.Read.All and Files.Read.All (admin-consented). Provide client creds
    via env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET.
"""

from __future__ import annotations

import os
from typing import Iterable, Optional

from ..models import ACL, Document

_GRAPH = "https://graph.microsoft.com/v1.0"
_SCOPE = ["https://graph.microsoft.com/.default"]
_TEXT_EXT = (".txt", ".md", ".csv", ".json", ".html", ".htm")


class SharePointConnector:
    source_name = "sharepoint"

    def __init__(
        self,
        drive_id: str,
        folder_path: str = "root",
        token: Optional[str] = None,
        org_is_public: bool = False,
    ):
        """
        drive_id: the target document library (drive) id.
        folder_path: "root" or "root:/Policies:" style path.
        token: a Graph bearer token; if None, one is acquired via MSAL client
               credentials from MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET.
        org_is_public: treat an organization-wide sharing link as public.
        """
        self.drive_id = drive_id
        self.folder_path = folder_path
        self._token = token
        self.org_is_public = org_is_public

    def _acquire_token(self) -> str:
        import msal  # lazy import

        tenant = os.environ["MS_TENANT_ID"]
        app = msal.ConfidentialClientApplication(
            client_id=os.environ["MS_CLIENT_ID"],
            client_credential=os.environ["MS_CLIENT_SECRET"],
            authority=f"https://login.microsoftonline.com/{tenant}",
        )
        result = app.acquire_token_for_client(scopes=_SCOPE)
        if "access_token" not in result:
            raise RuntimeError(f"Graph auth failed: {result.get('error_description')}")
        return result["access_token"]

    @property
    def token(self) -> str:
        if self._token is None:
            self._token = self._acquire_token()
        return self._token

    def _get(self, url: str) -> dict:
        import requests  # lazy import

        resp = requests.get(url, headers={"Authorization": f"Bearer {self.token}"})
        resp.raise_for_status()
        return resp.json()

    def _get_bytes(self, url: str) -> bytes:
        import requests  # lazy import

        resp = requests.get(url, headers={"Authorization": f"Bearer {self.token}"})
        resp.raise_for_status()
        return resp.content

    def _list_children(self) -> list[dict]:
        anchor = "root" if self.folder_path == "root" else self.folder_path
        url = f"{_GRAPH}/drives/{self.drive_id}/{anchor}/children"
        items, out = self._get(url), []
        while True:
            out.extend(items.get("value", []))
            nxt = items.get("@odata.nextLink")
            if not nxt:
                break
            items = self._get(nxt)
        return [i for i in out if "file" in i]

    def _read_text(self, item: dict) -> Optional[str]:
        name = item.get("name", "").lower()
        if not name.endswith(_TEXT_EXT):
            return None  # extend for .docx/.pdf via Graph 'format' conversion
        url = f"{_GRAPH}/drives/{self.drive_id}/items/{item['id']}/content"
        try:
            return self._get_bytes(url).decode("utf-8", errors="replace")
        except Exception:
            return None

    def _read_acl(self, item_id: str) -> ACL:
        url = f"{_GRAPH}/drives/{self.drive_id}/items/{item_id}/permissions"
        perms = self._get(url).get("value", [])
        public = False
        users: set[str] = set()
        groups: set[str] = set()
        for p in perms:
            link = p.get("link")
            if link and link.get("scope") == "anonymous":
                public = True
            if link and link.get("scope") == "organization" and self.org_is_public:
                public = True
            elif link and link.get("scope") == "organization":
                groups.add("organization")
            granted = p.get("grantedToV2") or {}
            user = granted.get("user")
            if user and (user.get("email") or user.get("userPrincipalName")):
                users.add((user.get("email") or user["userPrincipalName"]).lower())
            for gkey in ("group", "siteGroup"):
                grp = granted.get(gkey)
                if grp and grp.get("displayName"):
                    groups.add(grp["displayName"])
            # Some tenants return grantedToIdentitiesV2 (a list) for link grants.
            for ident in p.get("grantedToIdentitiesV2", []) or []:
                gu = ident.get("user")
                if gu and (gu.get("email") or gu.get("userPrincipalName")):
                    users.add((gu.get("email") or gu["userPrincipalName"]).lower())
        return ACL(
            public=public,
            allowed_users=frozenset(users),
            allowed_groups=frozenset(groups),
        )

    def fetch(self) -> Iterable[Document]:
        for item in self._list_children():
            text = self._read_text(item)
            if not text or not text.strip():
                continue
            acl = self._read_acl(item["id"])
            yield Document(
                id=f"sharepoint::{item['id']}",
                source=self.source_name,
                title=item.get("name", item["id"]),
                text=text,
                acl=acl,
                uri=item.get("webUrl", ""),
                metadata={"drive_id": self.drive_id},
            )
