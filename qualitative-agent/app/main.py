"""Beranda antarmuka lokal agen analisis kualitatif."""

from __future__ import annotations

import streamlit as st

from _bootstrap import (DATA_RAW_DIR, api_key_tersedia, buka_folder, catat_galat,
                        connect, load_method_configs, require_db, sidebar_footer,
                        table_count)

st.set_page_config(page_title="Agen Analisis Kualitatif", page_icon="🗂️", layout="wide")

st.title("Agen Analisis Kualitatif")
st.caption(
    "Semua data penelitian tersimpan di komputer ini. Hanya potongan teks yang Anda pilih "
    "untuk dianalisis yang dikirim ke AI Anthropic, dan setiap pengiriman tercatat di "
    "halaman Audit Trail."
)

sidebar_footer()

if not api_key_tersedia():
    st.warning("Kunci akses Anthropic belum diisi, sehingga AI belum dapat dipanggil.")
    st.page_link("pages/0_Pengaturan.py", label="Buka Pengaturan untuk mengisi kunci", icon="🔑")

if not require_db():
    st.stop()

# Metode yang modulnya sudah dibangun, beserta fungsi pembuka sesinya. Metode
# lain tetap ditampilkan agar peneliti tahu keberadaannya, namun tidak dapat
# dipilih untuk memulai sesi.
URUTAN_METODE = ["rta", "ta_classic", "ipa", "grounded_theory"]


def _mulai_rta(nama: str) -> int:
    from src.coding import rta
    return rta.start_run(nama)


PEMBUKA_SESI = {"rta": _mulai_rta}

st.subheader("Langkah kerja")
st.markdown(
    "1. Letakkan berkas penelitian (wawancara, catatan lapangan, dokumen) ke folder data "
    "lewat tombol di bawah.\n"
    "2. Masukkan berkas itu ke aplikasi.\n"
    "3. Mulai sesi analisis di bagian berikutnya halaman ini.\n"
    "4. Minta usulan kode dari AI untuk setiap unit makna.\n"
    "5. Bentuk tema, lalu tinjau seluruh usulan: sahkan, revisi, atau tolak."
)
tautan = st.columns(3)
tautan[0].page_link("pages/1_ingest.py", label="Langkah 2: Masukkan berkas", icon="📥")
tautan[1].page_link("pages/2_open_coding.py", label="Langkah 4: Usulan kode", icon="🏷️")
tautan[2].page_link("pages/3_categorization.py", label="Langkah 5: Tema dan tinjauan", icon="🗃️")

if st.button("📂 Buka folder data penelitian"):
    pesan = buka_folder(DATA_RAW_DIR)
    if pesan:
        st.info(pesan)
    else:
        st.success("Folder data dibuka. Salin berkas penelitian Anda ke sana, lalu buka "
                   "halaman Ingest.")

st.subheader("Mulai sesi analisis baru")
configs = load_method_configs()


def _label_metode(kode: str) -> str:
    nama = (configs.get(kode) or {}).get("display_name", kode)
    return nama if kode in PEMBUKA_SESI else f"{nama} — belum tersedia"


kolom = st.columns([2, 2])
nama_proyek = kolom[0].text_input("Nama proyek atau penelitian",
                                  placeholder="contoh: Studi Beban Kerja Guru")
metode = kolom[1].selectbox("Metode analisis", URUTAN_METODE, format_func=_label_metode)

if metode not in PEMBUKA_SESI:
    st.info("Metode ini belum tersedia di versi aplikasi ini. Saat ini baru Reflexive "
            "Thematic Analysis yang dapat dipakai.")

if st.button("Mulai sesi", type="primary",
             disabled=metode not in PEMBUKA_SESI or not nama_proyek.strip()):
    try:
        run_id = PEMBUKA_SESI[metode](nama_proyek.strip())
    except Exception as exc:  # noqa: BLE001 - ditampilkan sebagai pesan, rincian ke log
        catat_galat("memulai sesi analisis", exc)
        st.error("Sesi analisis gagal dibuat. Rincian teknis tersimpan di folder logs, "
                 "berkas app.log.")
    else:
        st.success(f"Sesi analisis #{run_id} untuk \"{nama_proyek.strip()}\" sudah dibuat. "
                   "Lanjutkan ke Langkah 4: Usulan kode.")

st.subheader("Ringkasan")
ringkasan = {
    "Dokumen": table_count("documents"),
    "Unit makna": table_count("units"),
    "Sesi analisis": table_count("method_runs"),
    "Kode": table_count("codes"),
    "Tema": table_count("categories"),
    "Memo": table_count("memos"),
}
kolom = st.columns(len(ringkasan))
for index, (label, jumlah) in enumerate(ringkasan.items()):
    kolom[index].metric(label, jumlah)

st.subheader("Sesi analisis")
conn = connect()
try:
    runs = conn.execute(
        """
        SELECT mr.id, mr.method, mr.project_label, mr.started_at,
               (SELECT COUNT(*) FROM codes c WHERE c.method_run_id = mr.id) AS jumlah_kode,
               (SELECT COUNT(*) FROM codes c WHERE c.method_run_id = mr.id
                    AND c.status = 'proposed') AS menunggu_tinjauan,
               (SELECT COUNT(*) FROM categories k WHERE k.method_run_id = mr.id) AS jumlah_tema
        FROM method_runs mr ORDER BY mr.id DESC
        """
    ).fetchall()
finally:
    conn.close()

if runs:
    st.dataframe(
        [
            {
                "No.": r["id"],
                "Proyek": r["project_label"],
                "Metode": (configs.get(r["method"]) or {}).get("display_name", r["method"]),
                "Dimulai": r["started_at"],
                "Kode": r["jumlah_kode"],
                "Menunggu tinjauan": r["menunggu_tinjauan"],
                "Tema": r["jumlah_tema"],
            }
            for r in runs
        ],
        width="stretch",
        hide_index=True,
    )
else:
    st.info("Belum ada sesi analisis. Mulai satu sesi di atas.")
