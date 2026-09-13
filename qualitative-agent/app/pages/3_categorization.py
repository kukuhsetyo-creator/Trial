"""Halaman kategorisasi dan peninjauan."""

import streamlit as st

from _bootstrap import pending_module, sidebar_footer

st.set_page_config(page_title="Kategorisasi", page_icon="🗃️", layout="wide")
sidebar_footer()

pending_module(
    judul="Kategorisasi dan Peninjauan",
    modul=["src/coding/thematic_coding.py", "src/coding/deviant_case.py",
           "src/validation/review_queue.py"],
    langkah="langkah 6 dan 7 dari urutan pembangunan",
    keterangan=(
        "Halaman ini akan memuat dua pekerjaan yang berbeda sifatnya. Yang pertama adalah "
        "agregasi kode menjadi tema, PET/GET, atau kategori aksial, yang bentuknya berbeda "
        "untuk setiap tradisi dan karenanya dikerjakan modul metode masing-masing. Yang kedua "
        "adalah antrean peninjauan, satu-satunya jalur yang boleh mengubah status kode dan "
        "kategori dari `proposed` menjadi `validated`, `revised`, atau `rejected`.\n\n"
        "Antarmuka peninjauan sengaja tidak dibuat lebih dahulu. Tombol validasi yang menulis "
        "langsung ke kolom `status` tanpa melewati `review_queue.py` akan melanggar prinsip "
        "human-in-the-loop justru pada titik yang paling ingin dijaga, sekaligus kehilangan "
        "riwayat revisi yang seharusnya tercatat di `validation_events`."
    ),
)
