"""Antrean peninjauan manusia.

Modul ini adalah **satu-satunya** tempat di seluruh proyek yang boleh mengubah
kolom ``status`` pada ``codes`` dan ``categories`` (CLAUDE.md §2). Setiap
perubahan selalu disertai baris pada ``validation_events``, dan keduanya terjadi
dalam satu transaksi: status tanpa jejak peninjauan, atau jejak tanpa perubahan
status, sama-sama merusak audit trail.

Perubahan status selalu merupakan tindakan manusia. Tidak ada fungsi di sini yang
memanggil model, dan tidak ada jalur yang mengubah status tanpa melewati fungsi
publik modul ini.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Literal

from src.db import connect

TargetType = Literal["code", "category"]
Action = Literal["validated", "revised", "rejected"]

TABEL = {"code": "codes", "category": "categories"}
AKSI_SAH = ("validated", "revised", "rejected")


class ReviewError(ValueError):
    """Permintaan peninjauan tidak sah."""


def _ambil_target(conn: sqlite3.Connection, target_type: TargetType, target_id: int) -> dict[str, Any]:
    if target_type not in TABEL:
        raise ReviewError(f"target_type '{target_type}' tidak sah; pilih 'code' atau 'category'.")
    baris = conn.execute(
        f"SELECT * FROM {TABEL[target_type]} WHERE id = ?", (target_id,)
    ).fetchone()
    if baris is None:
        raise ReviewError(f"{target_type} #{target_id} tidak ada.")
    return dict(baris)


def pending(
    method_run_id: int,
    *,
    target_type: TargetType = "code",
    conn: sqlite3.Connection | None = None,
) -> list[dict[str, Any]]:
    """Daftar target yang masih berstatus 'proposed' pada satu sesi analisis."""
    owns = conn is None
    conn = conn or connect()
    try:
        if target_type == "code":
            sql = """
                SELECT c.id, c.label, c.justification, c.coding_level, c.created_by,
                       c.created_at, u.text AS unit_text, u.speaker, d.title AS document_title
                FROM codes c
                JOIN units u ON u.id = c.unit_id
                JOIN documents d ON d.id = u.document_id
                WHERE c.method_run_id = ? AND c.status = 'proposed'
                ORDER BY c.id
            """
        else:
            sql = """
                SELECT id, label, definition, category_type, is_deviant_case, created_at
                FROM categories
                WHERE method_run_id = ? AND status = 'proposed'
                ORDER BY id
            """
        return [dict(r) for r in conn.execute(sql, (method_run_id,))]
    finally:
        if owns:
            conn.close()


def _terapkan(
    target_type: TargetType,
    target_id: int,
    action: Action,
    *,
    new_label: str | None = None,
    new_definition: str | None = None,
    reviewer_note: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    if action not in AKSI_SAH:
        raise ReviewError(f"action '{action}' tidak sah; pilih dari {AKSI_SAH}.")

    owns = conn is None
    conn = conn or connect()
    try:
        target = _ambil_target(conn, target_type, target_id)
        label_lama = target.get("label")
        label_baru = (new_label or "").strip() or None

        if action == "revised" and not label_baru and new_definition is None:
            raise ReviewError(
                "Aksi 'revised' menuntut label atau definisi baru; tanpa keduanya "
                "tidak ada yang direvisi dan aksinya sebaiknya 'validated'."
            )

        kolom = ["status = ?"]
        nilai: list[Any] = [action]
        if label_baru:
            kolom.append("label = ?")
            nilai.append(label_baru)
        if new_definition is not None and target_type == "category":
            kolom.append("definition = ?")
            nilai.append(new_definition)
        nilai.append(target_id)

        conn.execute(f"UPDATE {TABEL[target_type]} SET {', '.join(kolom)} WHERE id = ?", nilai)
        peristiwa = conn.execute(
            """
            INSERT INTO validation_events (target_type, target_id, action,
                                           previous_label, new_label, reviewer_note)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (target_type, target_id, action, label_lama, label_baru, reviewer_note),
        ).lastrowid
        conn.commit()
        return {
            "validation_event_id": int(peristiwa),
            "target_type": target_type,
            "target_id": target_id,
            "action": action,
            "previous_label": label_lama,
            "new_label": label_baru,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        if owns:
            conn.close()


def validate(target_type: TargetType, target_id: int, *, reviewer_note: str | None = None,
             conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Peneliti menerima usulan apa adanya."""
    return _terapkan(target_type, target_id, "validated",
                     reviewer_note=reviewer_note, conn=conn)


def revise(target_type: TargetType, target_id: int, *, new_label: str | None = None,
           new_definition: str | None = None, reviewer_note: str | None = None,
           conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Peneliti menerima usulan dengan perubahan; label lama tetap tercatat."""
    return _terapkan(target_type, target_id, "revised", new_label=new_label,
                     new_definition=new_definition, reviewer_note=reviewer_note, conn=conn)


def reject(target_type: TargetType, target_id: int, *, reviewer_note: str | None = None,
           conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Peneliti menolak usulan. Baris tidak dihapus agar jejaknya tetap terbaca."""
    return _terapkan(target_type, target_id, "rejected",
                     reviewer_note=reviewer_note, conn=conn)


def history(target_type: TargetType, target_id: int, *,
            conn: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    owns = conn is None
    conn = conn or connect()
    try:
        return [dict(r) for r in conn.execute(
            """
            SELECT id, action, previous_label, new_label, reviewer_note, reviewed_at
            FROM validation_events WHERE target_type = ? AND target_id = ? ORDER BY id
            """,
            (target_type, target_id),
        )]
    finally:
        if owns:
            conn.close()


def summary(method_run_id: int, *, conn: sqlite3.Connection | None = None) -> dict[str, dict[str, int]]:
    owns = conn is None
    conn = conn or connect()
    try:
        hasil: dict[str, dict[str, int]] = {}
        for target_type, tabel in TABEL.items():
            baris = conn.execute(
                f"SELECT status, COUNT(*) FROM {tabel} WHERE method_run_id = ? GROUP BY status",
                (method_run_id,),
            ).fetchall()
            hasil[target_type] = {r[0]: r[1] for r in baris}
        return hasil
    finally:
        if owns:
            conn.close()
