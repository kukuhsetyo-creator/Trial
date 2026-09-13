"""Halaman ekspor."""

import csv
import io

import streamlit as st

from _bootstrap import connect, require_db, sidebar_footer

st.set_page_config(page_title="Ekspor", page_icon="📤", layout="wide")
sidebar_footer()

st.title("Ekspor")

if not require_db():
    st.stop()

TABEL = ["documents", "units", "method_runs", "codes", "categories",
         "code_category_links", "category_relations", "memos", "audit_log",
         "validation_events"]

pilihan = st.selectbox("Tabel", TABEL)

conn = connect()
try:
    baris = conn.execute(f"SELECT * FROM {pilihan}").fetchall()
finally:
    conn.close()

st.caption(f"{len(baris)} baris")
if baris:
    st.dataframe([dict(r) for r in baris], width="stretch", hide_index=True)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=baris[0].keys())
    writer.writeheader()
    writer.writerows(dict(r) for r in baris)
    st.download_button(
        f"Unduh {pilihan}.csv",
        buffer.getvalue(),
        file_name=f"{pilihan}.csv",
        mime="text/csv",
    )
else:
    st.info("Tabel ini masih kosong.")

st.divider()
st.subheader("Laporan naratif")
st.info(
    "Pembangkitan thematic map, model grounded theory, dan laporan naratif menunggu "
    "generator di `output/` (langkah 10 dari urutan pembangunan). Ekspor CSV di atas "
    "adalah ekspor data mentah, bukan laporan analisis."
)
