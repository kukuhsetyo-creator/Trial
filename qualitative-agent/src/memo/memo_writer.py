"""Penulisan memo reflektif.

Memo yang dihasilkan model disimpan dengan ``created_by = 'model'`` dan tidak
pernah menggantikan memo peneliti. Keduanya hidup berdampingan di tabel yang sama
dan dibedakan oleh kolom tersebut, karena refleksivitas yang ditulis mesin dan
refleksivitas yang ditulis manusia bukan hal yang sama dan tidak boleh terbaca
seolah setara.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from src.api_client import call_claude
from src.audit.audit_logger import log_call
from src.db import connect

STAGE = "reflexive_memo"


def save_memo(
    method_run_id: int,
    content: str,
    *,
    created_by: str,
    related_code_id: int | None = None,
    related_category_id: int | None = None,
    conn: sqlite3.Connection | None = None,
) -> int:
    if created_by not in ("model", "human"):
        raise ValueError("created_by hanya boleh 'model' atau 'human'.")
    owns = conn is None
    conn = conn or connect()
    try:
        cursor = conn.execute(
            """
            INSERT INTO memos (method_run_id, related_code_id, related_category_id,
                               content, created_by)
            VALUES (?, ?, ?, ?, ?)
            """,
            (method_run_id, related_code_id, related_category_id, content.strip(), created_by),
        )
        conn.commit()
        return int(cursor.lastrowid)
    finally:
        if owns:
            conn.close()


def has_human_memo(method_run_id: int, *, conn: sqlite3.Connection | None = None) -> bool:
    owns = conn is None
    conn = conn or connect()
    try:
        return bool(conn.execute(
            "SELECT 1 FROM memos WHERE method_run_id = ? AND created_by = 'human' LIMIT 1",
            (method_run_id,),
        ).fetchone())
    finally:
        if owns:
            conn.close()


def generate_reflexive_memo(
    method_run_id: int,
    method_config: dict,
    *,
    stage: str,
    context: str,
    related_category_id: int | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Menghasilkan memo reflektif model untuk satu tahap, lalu menyimpannya."""
    template = (method_config.get("prompts") or {}).get("reflexive_memo")
    if not template:
        raise KeyError(
            f"Metode '{method_config.get('method')}' tidak memuat prompt reflexive_memo."
        )
    prompt = template.format(stage=stage, context=context)
    response = call_claude(
        prompt,
        model=method_config.get("model", "claude-sonnet-5"),
        method_run_id=method_run_id,
        stage=STAGE,
        client=client,
    )
    log_call(method_run_id, stage=STAGE, prompt=prompt, response=response)
    memo_id = save_memo(
        method_run_id, response.text, created_by="model",
        related_category_id=related_category_id,
    )
    return {"memo_id": memo_id, "content": response.text, "created_by": "model"}
