"""Beranda antarmuka lokal agen analisis kualitatif."""

from __future__ import annotations

import streamlit as st

from _bootstrap import (PROJECT_ROOT, connect, db_exists, load_method_configs,
                        require_db, sidebar_footer, table_count)

st.set_page_config(page_title="Agen Analisis Kualitatif", page_icon="🗂️", layout="wide")

st.title("Agen Analisis Kualitatif Lokal")
st.caption(
    "Seluruh data berada di perangkat ini. Pemanggilan model dilakukan ke Anthropic API "
    "dan setiap pemanggilan tercatat pada audit trail."
)

sidebar_footer()

if not require_db():
    st.stop()

TABLES = ["documents", "units", "method_runs", "codes", "categories", "memos",
          "audit_log", "validation_events"]

counts = {t: table_count(t) for t in TABLES}

st.subheader("Keadaan basis data")
kolom = st.columns(4)
for index, (table, jumlah) in enumerate(counts.items()):
    kolom[index % 4].metric(table, jumlah)

st.subheader("Sesi analisis")
conn = connect()
try:
    runs = conn.execute(
        """
        SELECT mr.id, mr.method, mr.project_label, mr.status, mr.started_at,
               (SELECT COUNT(*) FROM codes c WHERE c.method_run_id = mr.id) AS jumlah_kode,
               (SELECT COUNT(*) FROM categories k WHERE k.method_run_id = mr.id) AS jumlah_kategori,
               (SELECT COUNT(*) FROM audit_log a WHERE a.method_run_id = mr.id) AS panggilan_api
        FROM method_runs mr ORDER BY mr.id DESC
        """
    ).fetchall()
finally:
    conn.close()

if runs:
    st.dataframe([dict(row) for row in runs], width="stretch", hide_index=True)
else:
    st.info("Belum ada sesi analisis. Sebuah sesi dibuat ketika sebuah metode dijalankan atas sekumpulan dokumen.")

st.subheader("Konfigurasi metode yang terbaca")
configs = load_method_configs()
if configs:
    st.dataframe(
        [
            {
                "method": nama,
                "display_name": cfg.get("display_name", ""),
                "tahap": len(cfg.get("stages", []) or []),
                "prompt tersedia": ", ".join(sorted((cfg.get("prompts") or {}).keys())) or "-",
                "wajib tinjauan manusia": cfg.get("required_human_review"),
                "izinkan metrik antarpenilai": cfg.get("allow_interrater_reliability_metric"),
            }
            for nama, cfg in configs.items()
        ],
        width="stretch",
        hide_index=True,
    )
else:
    st.warning(f"Tidak ada berkas metode terbaca di `config/methods/` pada {PROJECT_ROOT}.")

st.subheader("Status pembangunan")
st.markdown(
    """
Halaman yang sudah berfungsi penuh adalah **Memo** (memo tulisan peneliti),
**Audit Trail**, dan **Ekspor** untuk data yang sudah ada di basis data.
Halaman **Ingest**, **Open Coding**, dan **Kategorisasi** menunggu modul
pendukungnya masing-masing dan menyatakan hal itu secara eksplisit alih-alih
menampilkan antarmuka yang tidak terhubung ke apa pun.
"""
)
