"""Google Drive + Google Docs connector.

Pulls documents from a Drive folder and, crucially, reads each file's real
sharing permissions via the Drive API and maps them onto our `ACL`:

    Drive permission type   ->  ACL field
    ----------------------      -------------------------------------------
    anyone                  ->  public = True
    user (emailAddress)     ->  allowed_users += email
    group (emailAddress)    ->  allowed_groups += group email
    domain (domain)         ->  allowed_groups += "domain:<domain>"

Google Docs are exported to text/plain; other text-like files are downloaded.

Requires (only when .fetch() is called):
    pip install google-api-python-client google-auth
Auth: a service account with domain-wide delegation, or OAuth user creds with
scopes: drive.readonly. Pass a googleapiclient `drive` service, or let the
connector build one from GOOGLE_APPLICATION_CREDENTIALS.

This maps to the same capabilities exposed by the Google Drive MCP connector
(search_files, read_file_content, get_file_permissions) if you prefer to source
documents through MCP instead of the SDK.
"""

from __future__ import annotations

from typing import Iterable, Optional

from ..models import ACL, Document

_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
_EXPORT_MIME = "text/plain"
_GDOC_MIME = "application/vnd.google-apps.document"


class GoogleDriveConnector:
    source_name = "google_drive"

    def __init__(
        self,
        folder_id: str,
        service=None,
        domain_is_public: bool = False,
    ):
        """
        folder_id: the Drive folder to ingest (recurses into Docs/text files).
        service: an authenticated googleapiclient drive v3 service; if None, one
                 is built from GOOGLE_APPLICATION_CREDENTIALS on first fetch.
        domain_is_public: treat a `domain`-type grant as public rather than a
                 group. Leave False so only the domain's members (a group) match.
        """
        self.folder_id = folder_id
        self._service = service
        self.domain_is_public = domain_is_public

    def _build_service(self):
        from google.oauth2 import service_account  # lazy import
        from googleapiclient.discovery import build

        import os

        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not creds_path:
            raise RuntimeError(
                "GOOGLE_APPLICATION_CREDENTIALS is not set and no drive service "
                "was provided to GoogleDriveConnector."
            )
        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=_SCOPES
        )
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    @property
    def service(self):
        if self._service is None:
            self._service = self._build_service()
        return self._service

    def _list_files(self) -> list[dict]:
        q = f"'{self.folder_id}' in parents and trashed = false"
        files, page_token = [], None
        while True:
            resp = (
                self.service.files()
                .list(
                    q=q,
                    fields="nextPageToken, files(id, name, mimeType)",
                    pageToken=page_token,
                    pageSize=100,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            files.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return files

    def _read_text(self, file: dict) -> Optional[str]:
        fid, mime = file["id"], file["mimeType"]
        try:
            if mime == _GDOC_MIME:
                data = (
                    self.service.files()
                    .export(fileId=fid, mimeType=_EXPORT_MIME)
                    .execute()
                )
            elif mime.startswith("text/") or mime == "application/json":
                data = self.service.files().get_media(fileId=fid).execute()
            else:
                return None  # skip binaries (extend with pypdf/docx as needed)
        except Exception:
            return None
        return data.decode("utf-8") if isinstance(data, bytes) else str(data)

    def _read_acl(self, file_id: str) -> ACL:
        perms = (
            self.service.permissions()
            .list(
                fileId=file_id,
                fields="permissions(type, emailAddress, domain, role)",
                supportsAllDrives=True,
            )
            .execute()
            .get("permissions", [])
        )
        public = False
        users: set[str] = set()
        groups: set[str] = set()
        for p in perms:
            ptype = p.get("type")
            if ptype == "anyone":
                public = True
            elif ptype == "user" and p.get("emailAddress"):
                users.add(p["emailAddress"].lower())
            elif ptype == "group" and p.get("emailAddress"):
                groups.add(p["emailAddress"].lower())
            elif ptype == "domain" and p.get("domain"):
                if self.domain_is_public:
                    public = True
                else:
                    groups.add(f"domain:{p['domain'].lower()}")
        return ACL(
            public=public,
            allowed_users=frozenset(users),
            allowed_groups=frozenset(groups),
        )

    def fetch(self) -> Iterable[Document]:
        for file in self._list_files():
            text = self._read_text(file)
            if not text or not text.strip():
                continue
            acl = self._read_acl(file["id"])
            yield Document(
                id=f"gdrive::{file['id']}",
                source=self.source_name,
                title=file["name"],
                text=text,
                acl=acl,
                uri=f"https://drive.google.com/file/d/{file['id']}",
                metadata={"mimeType": file["mimeType"]},
            )
