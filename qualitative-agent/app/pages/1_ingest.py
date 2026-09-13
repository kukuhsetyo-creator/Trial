"""Halaman ingest dokumen."""

import streamlit as st

from _bootstrap import pending_module, sidebar_footer

st.set_page_config(page_title="Ingest", page_icon="📥", layout="wide")
sidebar_footer()

pending_module(
    judul="Ingest Dokumen",
    modul=["src/ingestion/extract_pdf.py", "src/ingestion/extract_docx.py",
           "src/ingestion/extract_transcript.py", "src/ingestion/segment.py"],
    langkah="langkah 2 dari urutan pembangunan",
    keterangan=(
        "Halaman ini akan menerima berkas dari `data/raw/`, mengekstraksi teksnya dengan "
        "pelestarian turn-taking, jeda, dan overlap untuk transkrip, lalu menyegmentasinya "
        "menjadi unit makna. Segmentasi bukan pemotongan kalimat buta, sehingga ia menuntut "
        "modul tersendiri dan bukan pembagian panjang karakter di dalam antarmuka.\n\n"
        "`data/raw/` bersifat read-only secara arsitektural: unggahan berkas baru ke folder "
        "itu dilakukan peneliti di luar aplikasi, dan halaman ini hanya membacanya."
    ),
)
