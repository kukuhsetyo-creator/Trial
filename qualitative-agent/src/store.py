"""Persistensi kode dan kategori.

Modul ini adalah satu-satunya jalur penulisan ke tabel ``codes``, ``categories``,
dan ``code_category_links`` dari sisi analisis. Ia mekanis dan buta terhadap
metode: tidak ada fungsi di sini yang mengetahui apa itu tema, PET, atau kategori
inti, dan tidak ada percabangan berdasarkan nama metode.

Invarian yang ditegakkan secara struktural, bukan sebagai konvensi: **tidak satu
pun fungsi di modul ini menerima parameter status.** Setiap baris yang lahir dari
sini berstatus ``proposed``. Promosi menjadi ``validated``, ``revised``, atau
``rejected`` hanya terjadi di ``src/validation/review_queue.py`` atas aksi
manusia (CLAUDE.md §2). Menaruh parameter status di sini akan membuat pelanggaran
hanya berjarak satu argumen dari setiap pemanggil.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Iterable

from src.db import connect

PROPOSED = "proposed"


def _with_conn(conn: sqlite3.Connection | None):
    return (conn, False) if conn is not None else (connect(), True)


def save_codes(
    method_run_id: int,
    unit_id: int,
    proposals: Iterable[dict[str, Any]],
    *,
    created_by: str = "model",
    conn: sqlite3.Connection | None = None,
) -> list[int]:
    """Menyimpan proposal kode untuk satu unit. Seluruh baris berstatus 'proposed'.

    Kunci ``status`` yang mungkin menempel pada proposal diabaikan, bukan dipakai.
    """
    if created_by not in ("model", "human"):
        raise ValueError("created_by hanya boleh 'model' atau 'human'.")

    conn, owns = _with_conn(conn)
    try:
        ids: list[int] = []
        for proposal in proposals:
            label = str(proposal.get("label", "")).strip()
            if not label:
                continue
            coding_level = proposal.get("coding_level")
            if coding_level is not None and coding_level not in ("descriptive", "linguistic", "conceptual"):
                raise ValueError(f"coding_level '{coding_level}' tidak sah.")
            cursor = conn.execute(
                """
                INSERT INTO codes (method_run_id, unit_id, label, justification,
                                   coding_level, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (method_run_id, unit_id, label, proposal.get("justification"),
                 coding_level, PROPOSED, created_by),
            )
            ids.append(int(cursor.lastrowid))
        conn.commit()
        return ids
    finally:
        if owns:
            conn.close()


def save_category(
    method_run_id: int,
    *,
    label: str,
    category_type: str,
    definition: str | None = None,
    parent_id: int | None = None,
    is_deviant_case: str = "no",
    conn: sqlite3.Connection | None = None,
) -> int:
    """Menyimpan satu kategori berstatus 'proposed'."""
    if is_deviant_case not in ("yes", "no"):
        raise ValueError("is_deviant_case hanya boleh 'yes' atau 'no'.")

    conn, owns = _with_conn(conn)
    try:
        cursor = conn.execute(
            """
            INSERT INTO categories (method_run_id, parent_id, label, definition,
                                    category_type, is_deviant_case, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (method_run_id, parent_id, label.strip(), definition, category_type,
             is_deviant_case, PROPOSED),
        )
        conn.commit()
        return int(cursor.lastrowid)
    finally:
        if owns:
            conn.close()


def link_codes_to_category(
    category_id: int,
    code_ids: Iterable[int],
    *,
    conn: sqlite3.Connection | None = None,
) -> int:
    conn, owns = _with_conn(conn)
    try:
        pasangan = [(int(code_id), category_id) for code_id in code_ids]
        conn.executemany(
            "INSERT OR IGNORE INTO code_category_links (code_id, category_id) VALUES (?, ?)",
            pasangan,
        )
        conn.commit()
        return len(pasangan)
    finally:
        if owns:
            conn.close()


def fetch_codes(
    method_run_id: int,
    *,
    statuses: Iterable[str] | None = None,
    conn: sqlite3.Connection | None = None,
) -> list[dict[str, Any]]:
    conn, owns = _with_conn(conn)
    try:
        sql = """
            SELECT c.id, c.unit_id, c.label, c.justification, c.coding_level,
                   c.status, c.created_by, c.created_at, u.text AS unit_text,
                   u.speaker, d.participant_id, d.title AS document_title
            FROM codes c
            JOIN units u ON u.id = c.unit_id
            JOIN documents d ON d.id = u.document_id
            WHERE c.method_run_id = ?
        """
        params: list[Any] = [method_run_id]
        if statuses:
            statuses = list(statuses)
            sql += f" AND c.status IN ({','.join('?' * len(statuses))})"
            params.extend(statuses)
        sql += " ORDER BY c.id"
        return [dict(row) for row in conn.execute(sql, params)]
    finally:
        if owns:
            conn.close()


def fetch_categories(
    method_run_id: int,
    *,
    category_types: Iterable[str] | None = None,
    statuses: Iterable[str] | None = None,
    conn: sqlite3.Connection | None = None,
) -> list[dict[str, Any]]:
    conn, owns = _with_conn(conn)
    try:
        sql = "SELECT * FROM categories WHERE method_run_id = ?"
        params: list[Any] = [method_run_id]
        if category_types:
            category_types = list(category_types)
            sql += f" AND category_type IN ({','.join('?' * len(category_types))})"
            params.extend(category_types)
        if statuses:
            statuses = list(statuses)
            sql += f" AND status IN ({','.join('?' * len(statuses))})"
            params.extend(statuses)
        sql += " ORDER BY id"
        return [dict(row) for row in conn.execute(sql, params)]
    finally:
        if owns:
            conn.close()


def codes_for_category(category_id: int, *, conn: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    conn, owns = _with_conn(conn)
    try:
        return [dict(row) for row in conn.execute(
            """
            SELECT c.id, c.label, c.justification, c.status, u.text AS unit_text, u.speaker
            FROM code_category_links l
            JOIN codes c ON c.id = l.code_id
            JOIN units u ON u.id = c.unit_id
            WHERE l.category_id = ? ORDER BY c.id
            """,
            (category_id,),
        )]
    finally:
        if owns:
            conn.close()


def create_method_run(
    method: str,
    project_label: str,
    *,
    config_snapshot_json: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> int:
    conn, owns = _with_conn(conn)
    try:
        cursor = conn.execute(
            "INSERT INTO method_runs (method, project_label, config_snapshot_json) VALUES (?, ?, ?)",
            (method, project_label, config_snapshot_json),
        )
        conn.commit()
        return int(cursor.lastrowid)
    finally:
        if owns:
            conn.close()
