"""Reflexive Thematic Analysis (Braun & Clarke).

Modul ini berdiri sendiri dan tidak berbagi satu baris logika pun dengan modul
Thematic Analysis klasik, meskipun keduanya menghasilkan sesuatu yang sama-sama
disebut "tema". Pemisahan itu justru paling diperlukan pada pasangan ini, karena
kemiripan permukaannya menyamarkan perbedaan yang menentukan: pada RTA tema
adalah konstruksi aktif peneliti, bukan pola yang ditemukan di dalam data dan
bukan pula kategori yang disepakati dua penilai.

Tiga konsekuensi diterjemahkan menjadi perilaku kode, bukan sekadar catatan:

1. Tidak ada hitungan frekuensi kode yang pernah sampai ke prompt pembentukan
   tema. Prevalensi bukan argumen bagi tema RTA, dan cara paling andal untuk
   mencegah model memakainya adalah tidak pernah memberikannya.
2. Metrik reliabilitas antarpenilai ditolak secara aktif, bukan sekadar tidak
   disediakan. Permintaan menghitungnya melempar pengecualian yang menjelaskan
   alasan epistemologisnya.
3. Penamaan dan pendefinisian tema tidak dapat dijalankan sebelum peneliti
   menulis sekurang-kurangnya satu memo reflektifnya sendiri, sesuai
   ``reflexive_memo_required`` pada konfigurasi metode.
"""

from __future__ import annotations

import json
import random
import re
from typing import Any

from config.loader import load_method_config
from src.api_client import call_claude
from src.audit.audit_logger import log_call
from src.coding.open_coding import generate_initial_codes
from src.db import connect
from src.memo import memo_writer
from src.store import (codes_for_category, fetch_categories, fetch_codes,
                       link_codes_to_category, save_category, create_method_run)

METHOD = "rta"
THEME_TYPE = "theme"
SUBTHEME_TYPE = "subtheme"


class InterraterMetricRefused(RuntimeError):
    """Permintaan metrik reliabilitas antarpenilai pada analisis RTA."""


class ReflexivityRequired(RuntimeError):
    """Tahap menuntut memo reflektif peneliti yang belum ada."""


class RTAParseError(ValueError):
    """Respons model tidak dapat diuraikan menjadi struktur yang diharapkan."""


def load_config() -> dict[str, Any]:
    config = load_method_config(METHOD)
    if config.get("allow_interrater_reliability_metric"):
        raise InterraterMetricRefused(
            "config/methods/rta.yaml menyetel allow_interrater_reliability_metric ke true. "
            "Pada RTA, kesepakatan antarpenilai bukan ukuran kualitas tema; menyalakannya "
            "berarti menjalankan metode yang berbeda dengan nama RTA."
        )
    return config


def compute_interrater_reliability(*_args: Any, **_kwargs: Any) -> None:
    """Selalu menolak. Ada sebagai penolakan eksplisit, bukan sebagai celah yang lupa diisi."""
    raise InterraterMetricRefused(
        "Kappa, persentase kesepakatan, dan metrik sejenis tidak dihitung pada RTA. "
        "Tema adalah hasil keterlibatan interpretatif peneliti dengan data; dua peneliti "
        "yang menghasilkan tema berbeda bukan tanda kegagalan pengukuran."
    )


def _extract_json_array(teks: str) -> list[Any]:
    cocok = re.search(r"\[.*\]", teks, flags=re.DOTALL)
    if not cocok:
        raise RTAParseError("Respons model tidak memuat array JSON.")
    try:
        data = json.loads(cocok.group(0))
    except json.JSONDecodeError as exc:
        raise RTAParseError(f"Array JSON pada respons tidak valid: {exc}") from exc
    if not isinstance(data, list):
        raise RTAParseError("Respons model bukan array JSON.")
    return data


def _call(config: dict, prompt: str, *, method_run_id: int, stage: str, client: Any | None) -> str:
    response = call_claude(
        prompt,
        model=config.get("model", "claude-sonnet-5"),
        method_run_id=method_run_id,
        stage=stage,
        client=client,
    )
    log_call(method_run_id, stage=stage, prompt=prompt, response=response)
    return response.text


def start_run(project_label: str, *, config: dict | None = None) -> int:
    """Membuka satu sesi analisis RTA beserta salinan konfigurasinya."""
    config = config or load_config()
    return create_method_run(
        METHOD, project_label,
        config_snapshot_json=json.dumps(config, ensure_ascii=False, default=str),
    )


def familiarization(
    method_run_id: int,
    document_id: int,
    *,
    config: dict | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Tahap pembiasaan: memo reflektif atas kesan awal terhadap satu dokumen.

    Pembiasaan pada RTA bukan pekerjaan mekanis membaca ulang, melainkan titik
    ketika peneliti mulai menyadari apa yang menarik perhatiannya dan mengapa.
    Karena itu keluarannya memo, bukan kode.
    """
    config = config or load_config()
    conn = connect()
    try:
        dokumen = conn.execute(
            "SELECT title, source_type, participant_id FROM documents WHERE id = ?",
            (document_id,),
        ).fetchone()
        if dokumen is None:
            raise ValueError(f"Dokumen #{document_id} tidak ada.")
        cuplikan = [
            r["text"] for r in conn.execute(
                "SELECT text FROM units WHERE document_id = ? ORDER BY sequence_index LIMIT 12",
                (document_id,),
            )
        ]
    finally:
        conn.close()

    konteks = (
        f"Dokumen '{dokumen['title']}' ({dokumen['source_type']})"
        + (f", partisipan {dokumen['participant_id']}" if dokumen["participant_id"] else "")
        + ".\n\nCuplikan unit:\n" + "\n".join(f"- {t}" for t in cuplikan)
    )
    return memo_writer.generate_reflexive_memo(
        method_run_id, config, stage="familiarization", context=konteks, client=client,
    )


def code_units(
    method_run_id: int,
    *,
    unit_ids: list[int] | None = None,
    document_id: int | None = None,
    config: dict | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Coding inisial atas unit terpilih, disimpan dengan status 'proposed'."""
    from src.store import save_codes

    config = config or load_config()
    conn = connect()
    try:
        sql = """
            SELECT u.id, u.text, u.speaker, d.title, d.participant_id
            FROM units u JOIN documents d ON d.id = u.document_id
        """
        params: list[Any] = []
        if unit_ids:
            sql += f" WHERE u.id IN ({','.join('?' * len(unit_ids))})"
            params.extend(unit_ids)
        elif document_id is not None:
            sql += " WHERE u.document_id = ?"
            params.append(document_id)
        sql += " ORDER BY u.document_id, u.sequence_index"
        units = [dict(r) for r in conn.execute(sql, params)]
    finally:
        conn.close()

    if not units:
        raise ValueError("Tidak ada unit yang cocok dengan kriteria yang diberikan.")

    tersimpan: list[int] = []
    gagal: list[dict[str, Any]] = []
    for unit in units:
        konteks = unit["title"] + (f" · partisipan {unit['participant_id']}"
                                   if unit["participant_id"] else "")
        try:
            proposals = generate_initial_codes(
                unit_text=unit["text"],
                document_context=konteks,
                method_config=config,
                method_run_id=method_run_id,
                client=client,
            )
        except Exception as exc:  # noqa: BLE001 - dilaporkan per unit, tidak menghentikan sisanya
            gagal.append({"unit_id": unit["id"], "error": str(exc)})
            continue
        tersimpan.extend(save_codes(method_run_id, unit["id"], proposals))

    return {
        "unit_diproses": len(units),
        "kode_tersimpan": len(tersimpan),
        "code_ids": tersimpan,
        "unit_gagal": gagal,
    }


def _bundle_codes_without_prevalence(codes: list[dict[str, Any]]) -> str:
    """Menyusun daftar kode untuk prompt tanpa hitungan apa pun.

    Urutan diacak dengan sengaja. Kode yang tersusun menurut urutan kemunculan
    membawa sinyal prevalensi secara diam-diam, dan sinyal itulah yang justru
    tidak boleh menjadi dasar pembentukan tema pada RTA.
    """
    acak = list(codes)
    random.shuffle(acak)
    return "\n".join(
        f"- [{c['id']}] {c['label']}"
        + (f" — justifikasi: {c['justification']}" if c.get("justification") else "")
        + (f"\n  kutipan: \"{c['unit_text'][:220]}\"" if c.get("unit_text") else "")
        for c in acak
    )


THEME_CONTRACT = """

Jawab HANYA dengan array JSON, tanpa teks pembuka atau penutup:
[{"label": "<nama tema>", "story": "<cerita yang ditangkap tema ini>",
  "code_ids": [<id kode yang tercakup>], "quote": "<satu kutipan pendukung>"}]"""


def generate_themes(
    method_run_id: int,
    *,
    config: dict | None = None,
    client: Any | None = None,
    write_memo: bool = True,
) -> dict[str, Any]:
    """Membentuk tema dari kode berstatus proposed maupun validated.

    Kode yang sudah ditolak peneliti tidak ikut, sedangkan kode yang masih
    berstatus proposed tetap ikut: pada RTA pembentukan tema adalah bagian dari
    proses interpretatif yang berjalan bersamaan dengan peninjauan kode, bukan
    tahap yang menunggu seluruh kode disahkan lebih dahulu.
    """
    config = config or load_config()
    codes = fetch_codes(method_run_id, statuses=("proposed", "validated", "revised"))
    if not codes:
        raise ValueError("Belum ada kode yang dapat dijadikan dasar pembentukan tema.")

    prompt = config["prompts"]["theme_generation"].format(
        code_list=_bundle_codes_without_prevalence(codes)
    ) + THEME_CONTRACT
    teks = _call(config, prompt, method_run_id=method_run_id,
                 stage="theme_generation", client=client)

    valid_ids = {c["id"] for c in codes}
    tema_tersimpan: list[dict[str, Any]] = []
    for item in _extract_json_array(teks):
        if not isinstance(item, dict) or not str(item.get("label", "")).strip():
            continue
        definisi = str(item.get("story", "")).strip() or None
        if item.get("quote"):
            definisi = f"{definisi or ''}\n\nKutipan: \"{str(item['quote']).strip()}\"".strip()
        category_id = save_category(
            method_run_id,
            label=str(item["label"]).strip(),
            category_type=THEME_TYPE,
            definition=definisi,
        )
        terkait = [int(i) for i in (item.get("code_ids") or [])
                   if isinstance(i, (int, str)) and str(i).isdigit() and int(i) in valid_ids]
        if terkait:
            link_codes_to_category(category_id, terkait)
        tema_tersimpan.append({"category_id": category_id, "label": item["label"],
                               "kode_tertaut": len(terkait)})

    if not tema_tersimpan:
        raise RTAParseError("Tidak ada tema berlabel yang dapat diuraikan dari respons model.")

    memo = None
    if write_memo:
        memo = memo_writer.generate_reflexive_memo(
            method_run_id, config, stage="theme_generation",
            context="Tema yang baru terbentuk: "
                    + "; ".join(t["label"] for t in tema_tersimpan),
            client=client,
        )
    return {"tema": tema_tersimpan, "memo": memo}


def review_themes(
    method_run_id: int,
    *,
    config: dict | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Tahap peninjauan tema. Keluarannya penilaian untuk peneliti, bukan perubahan status."""
    config = config or load_config()
    tema = fetch_categories(method_run_id, category_types=(THEME_TYPE,),
                            statuses=("proposed", "validated", "revised"))
    if not tema:
        raise ValueError("Belum ada tema yang dapat ditinjau.")

    berkas = []
    for t in tema:
        kode = codes_for_category(t["id"])
        berkas.append(
            f"Tema [{t['id']}] {t['label']}\n"
            f"  definisi kerja: {t['definition'] or '(belum ada)'}\n"
            + "".join(f"  - {k['label']}: \"{k['unit_text'][:160]}\"\n" for k in kode)
        )

    prompt = config["prompts"]["theme_review"].format(theme_bundle="\n".join(berkas))
    teks = _call(config, prompt, method_run_id=method_run_id,
                 stage="theme_review", client=client)
    memo_id = memo_writer.save_memo(method_run_id, teks, created_by="model")
    return {"penilaian": teks, "memo_id": memo_id, "tema_ditinjau": len(tema)}


DEFINITION_CONTRACT = """

Jawab HANYA dengan array JSON berisi satu elemen:
[{"label": "<nama akhir tema>", "definition": "<definisi dua sampai empat kalimat>",
  "quote": "<kutipan paling mewakili>"}]"""


def define_and_name_themes(
    method_run_id: int,
    *,
    config: dict | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Menyusun nama dan definisi akhir tema.

    Tahap ini menuntut peneliti sudah menulis sekurang-kurangnya satu memo
    reflektifnya sendiri. Tema yang dinamai tanpa satu pun jejak refleksivitas
    peneliti adalah tema yang dinamai model, dan RTA tidak mengenal posisi itu.
    Hanya tema berstatus 'proposed' yang disunting; tema yang sudah disahkan
    peneliti tidak pernah ditimpa.
    """
    config = config or load_config()
    if config.get("stage_flags", {}).get("reflexive_memo_required") and not memo_writer.has_human_memo(method_run_id):
        raise ReflexivityRequired(
            "Belum ada memo reflektif tulisan peneliti pada sesi ini. RTA menempatkan "
            "subjektivitas peneliti sebagai sumber daya analitik yang harus terekam, "
            "sehingga penamaan tema tidak dijalankan sebelum memo itu ada."
        )

    tema = fetch_categories(method_run_id, category_types=(THEME_TYPE,), statuses=("proposed",))
    if not tema:
        raise ValueError("Tidak ada tema berstatus 'proposed' yang perlu dinamai.")

    hasil = []
    conn = connect()
    try:
        for t in tema:
            kode = codes_for_category(t["id"], conn=conn)
            prompt = config["prompts"]["theme_definition_naming"].format(
                theme_label=t["label"],
                theme_definition=t["definition"] or "(belum ada)",
                codes_and_quotes="\n".join(
                    f"- {k['label']}: \"{k['unit_text'][:200]}\"" for k in kode
                ) or "(belum ada kode tertaut)",
            ) + DEFINITION_CONTRACT
            teks = _call(config, prompt, method_run_id=method_run_id,
                         stage="theme_definition_naming", client=client)
            elemen = _extract_json_array(teks)
            if not elemen or not isinstance(elemen[0], dict):
                raise RTAParseError(f"Respons untuk tema #{t['id']} tidak dapat diuraikan.")
            data = elemen[0]
            label_baru = str(data.get("label", t["label"])).strip() or t["label"]
            definisi = str(data.get("definition", "")).strip() or t["definition"]
            if data.get("quote"):
                definisi = f"{definisi}\n\nKutipan: \"{str(data['quote']).strip()}\""
            # Hanya label dan definisi yang disunting. Kolom status tidak pernah
            # disentuh di sini maupun di mana pun selain review_queue.
            conn.execute(
                "UPDATE categories SET label = ?, definition = ? WHERE id = ? AND status = 'proposed'",
                (label_baru, definisi, t["id"]),
            )
            hasil.append({"category_id": t["id"], "label_lama": t["label"],
                          "label_baru": label_baru})
        conn.commit()
    finally:
        conn.close()
    return {"tema_dinamai": hasil}
