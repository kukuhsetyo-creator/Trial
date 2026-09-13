"""Coding inisial per unit makna.

Modul ini sengaja dibuat buta terhadap metode. Ia tidak mengenal nama 'rta',
'ta_classic', 'ipa', maupun 'grounded_theory', dan tidak memuat satu pun
percabangan berdasarkan metode. Seluruh perbedaan epistemologis antartradisi
masuk lewat ``method_config``, yaitu isi ``config/methods/*.yaml``, sehingga
modul metode yang berbeda memanggil fungsi yang sama dengan konfigurasi yang
berbeda tanpa logika bersama yang menyamarkan perbedaan tersebut.

Batas tanggung jawab modul ini berhenti pada penyusunan prompt, pemanggilan
model, pencatatan audit, dan penguraian respons menjadi struktur datar berisi
label dan justifikasi. Agregasi kode menjadi tema, PET/GET, atau kategori aksial
adalah urusan modul metode masing-masing.

Status hasil SELALU 'proposed'. Modul ini tidak menyediakan jalan apa pun untuk
menghasilkan status lain (CLAUDE.md §2).
"""

from __future__ import annotations

import json
import re
from typing import Any

from src.api_client import call_claude
from src.audit.audit_logger import log_call

STAGE = "open_coding"

# Satu-satunya status yang boleh lahir dari modul mana pun di src/coding/.
# Promosi ke 'validated', 'revised', atau 'rejected' hanya terjadi lewat
# src/validation/review_queue.py atas aksi manusia.
PROPOSED_STATUS = "proposed"

# Instruksi format keluaran bersifat mekanis, bukan epistemologis: ia hanya
# menetapkan bentuk wadah, tanpa menyentuh kriteria apa yang layak menjadi kode.
# Karena itu ia netral terhadap metode dan boleh berada di modul bersama ini,
# sementara seluruh instruksi substantif tetap berada di berkas YAML metode.
OUTPUT_CONTRACT = """

Jawab HANYA dengan array JSON, tanpa teks pembuka atau penutup, dengan bentuk:
[{"label": "<label kode>", "justification": "<justifikasi singkat>"}]
Sertakan setiap kode yang Anda usulkan sebagai satu elemen array."""


class OpenCodingParseError(ValueError):
    """Respons model tidak dapat diuraikan menjadi daftar proposal kode."""


def build_prompt(unit_text: str, document_context: str, method_config: dict) -> str:
    try:
        template = method_config["prompts"]["open_coding"]
    except (KeyError, TypeError) as exc:
        raise KeyError(
            "method_config tidak memuat prompts.open_coding; periksa berkas "
            "config/methods/*.yaml untuk metode yang sedang dijalankan."
        ) from exc
    return template.format(unit_text=unit_text, document_context=document_context) + OUTPUT_CONTRACT


def parse_proposals(response_text: str) -> list[dict[str, Any]]:
    """Menguraikan respons menjadi daftar proposal kode berstatus 'proposed'."""
    match = re.search(r"\[.*\]", response_text, flags=re.DOTALL)
    if not match:
        raise OpenCodingParseError("Respons model tidak memuat array JSON yang dapat diuraikan.")
    try:
        raw = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise OpenCodingParseError(f"Array JSON pada respons model tidak valid: {exc}") from exc
    if not isinstance(raw, list):
        raise OpenCodingParseError("Respons model bukan array JSON.")

    proposals: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict) or not str(item.get("label", "")).strip():
            continue
        proposals.append({
            "label": str(item["label"]).strip(),
            "justification": (str(item.get("justification")).strip()
                              if item.get("justification") is not None else None),
            "status": PROPOSED_STATUS,
        })
    if not proposals:
        raise OpenCodingParseError("Tidak ada proposal kode berlabel pada respons model.")
    return proposals


def generate_initial_codes(
    unit_text: str,
    document_context: str,
    method_config: dict,
    method_run_id: int,
    *,
    client: Any | None = None,
) -> list[dict[str, Any]]:
    """Menghasilkan kode kandidat untuk satu unit teks.

    Status hasil SELALU 'proposed' — tidak pernah otomatis 'validated'.

    Mengembalikan daftar, bukan satu kode tunggal, karena coding inisial
    line-by-line pada satu unit makna lazim menghasilkan lebih dari satu kode;
    memaksakan satu kode per unit akan membuang proposal secara diam-diam.
    """
    prompt = build_prompt(unit_text, document_context, method_config)
    response = call_claude(
        prompt,
        model=method_config.get("model", "claude-sonnet-5"),
        method_run_id=method_run_id,
        stage=STAGE,
        client=client,
    )
    # Pencatatan mendahului penguraian: respons yang gagal diurai pun tetap
    # meninggalkan jejak audit yang lengkap.
    log_call(
        method_run_id,
        stage=STAGE,
        prompt=prompt,
        response=response,
    )
    return parse_proposals(response.text)
