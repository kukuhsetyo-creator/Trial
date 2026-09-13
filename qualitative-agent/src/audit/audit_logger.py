"""Pencatatan audit trail untuk setiap pemanggilan Anthropic API.

Prinsip Non-Negosiasi §0.4: setiap pemanggilan API dicatat (prompt, response,
timestamp, model, biaya token) demi dependability dan confirmability. Modul ini
adalah satu-satunya pintu masuk ke tabel ``audit_log``.

Catatan setiap pemanggilan ditulis ke dua tempat: tabel ``audit_log`` di SQLite
sebagai sumber kebenaran yang terelasi dengan ``method_runs``, dan berkas JSONL
di ``audit_trail/`` sebagai salinan portabel yang tetap terbaca tanpa basis data
(Struktur Direktori §1). Kegagalan menulis salinan JSONL tidak membatalkan
pencatatan ke basis data, namun dilaporkan sebagai peringatan, karena kehilangan
salinan portabel lebih ringan daripada kehilangan jejak audit sama sekali.
"""

from __future__ import annotations

import json
import sqlite3
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.db import PROJECT_ROOT, connect

AUDIT_TRAIL_DIR = PROJECT_ROOT / "audit_trail"

# Ditulis pada kolom model_used ketika pemanggilan gagal sebelum model sempat
# menjawab, sehingga baris audit tetap memenuhi constraint NOT NULL tanpa
# berpura-pura bahwa ada respons yang diterima.
FAILURE_RESPONSE_PREFIX = "[CALL_FAILED]"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _append_jsonl(record: dict[str, Any]) -> None:
    try:
        AUDIT_TRAIL_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        with (AUDIT_TRAIL_DIR / f"audit-{stamp}.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:  # pragma: no cover - bergantung pada kondisi berkas
        warnings.warn(f"Salinan JSONL audit trail gagal ditulis: {exc}", RuntimeWarning)


def log_call(
    method_run_id: int | None,
    *,
    stage: str,
    prompt: str,
    response: Any,
    model: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    conn: sqlite3.Connection | None = None,
) -> int:
    """Mencatat satu pemanggilan API dan mengembalikan id baris ``audit_log``.

    ``response`` boleh berupa objek hasil ``api_client.call_claude`` (metadata
    model dan token diambil otomatis) maupun teks mentah. Argumen ``model``,
    ``input_tokens``, dan ``output_tokens`` yang diberikan eksplisit selalu
    menang atas metadata yang menempel pada objek respons.
    """
    response_text = getattr(response, "text", response)
    if not isinstance(response_text, str):
        response_text = str(response_text)

    model_used = model or getattr(response, "model", None)
    if not model_used:
        raise ValueError(
            "Nama model wajib tercatat pada audit trail; berikan argumen model "
            "atau gunakan objek respons yang membawa metadata model."
        )

    if input_tokens is None:
        input_tokens = getattr(response, "input_tokens", None)
    if output_tokens is None:
        output_tokens = getattr(response, "output_tokens", None)

    called_at = _utc_now()
    owns_connection = conn is None
    conn = conn or connect()
    try:
        cursor = conn.execute(
            """
            INSERT INTO audit_log (
                method_run_id, stage, prompt_text, response_text,
                model_used, input_tokens, output_tokens, called_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (method_run_id, stage, prompt, response_text, model_used,
             input_tokens, output_tokens, called_at),
        )
        conn.commit()
        audit_id = int(cursor.lastrowid)
    finally:
        if owns_connection:
            conn.close()

    _append_jsonl({
        "audit_log_id": audit_id,
        "method_run_id": method_run_id,
        "stage": stage,
        "model_used": model_used,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "called_at": called_at,
        "prompt_text": prompt,
        "response_text": response_text,
    })
    return audit_id


def log_failure(
    method_run_id: int | None,
    *,
    stage: str,
    prompt: str,
    model: str,
    error: BaseException | str,
    attempts: int,
    conn: sqlite3.Connection | None = None,
) -> int:
    """Mencatat pemanggilan yang gagal total setelah seluruh percobaan habis.

    Pemanggilan yang gagal tidak pernah sampai ke fungsi pemanggil, sehingga
    pencatatannya tidak dapat diserahkan kepada caller. Kegagalan adalah bagian
    dari jejak yang bermakna bagi dependability: sebuah run yang kehilangan
    separuh unitnya karena kesalahan jaringan harus terbaca sebagai demikian,
    bukan sebagai run yang bersih.
    """
    return log_call(
        method_run_id,
        stage=stage,
        prompt=prompt,
        response=f"{FAILURE_RESPONSE_PREFIX} after {attempts} attempt(s): {error}",
        model=model,
        input_tokens=None,
        output_tokens=None,
        conn=conn,
    )
