"""Halaman ingest dokumen."""

import json

import streamlit as st

from _bootstrap import connect, require_db, sidebar_footer

st.set_page_config(page_title="Ingest", page_icon="📥", layout="wide")
sidebar_footer()

st.title("Ingest Dokumen")
st.caption(
    "Berkas dibaca dari `data/raw/` dan tidak pernah diubah. Letakkan berkas baru ke "
    "folder itu di luar aplikasi; antarmuka ini sengaja tidak menyediakan unggahan agar "
    "sifat read-only data mentah tidak bergantung pada kehati-hatian pemakai."
)

if not require_db():
    st.stop()

from src.ingestion._raw import RAW_DIR  # noqa: E402
from src.ingestion.ingest import SOURCE_TYPES, IngestError, ingest_document  # noqa: E402

conn = connect()
try:
    sudah = {r["file_path"]: r["id"] for r in conn.execute("SELECT id, file_path FROM documents")}
    dokumen = [dict(r) for r in conn.execute(
        """
        SELECT d.id, d.title, d.source_type, d.file_path, d.participant_id, d.added_at,
               (SELECT COUNT(*) FROM units u WHERE u.document_id = d.id) AS jumlah_unit
        FROM documents d ORDER BY d.id DESC
        """
    ).fetchall()]
finally:
    conn.close()

if not RAW_DIR.exists():
    st.error(f"Folder `data/raw/` belum ada di {RAW_DIR.parent}.")
    st.stop()

berkas = sorted(p for p in RAW_DIR.iterdir() if p.is_file() and not p.name.startswith("."))
belum = [p for p in berkas if p.name not in sudah]

st.subheader("Berkas di data/raw/")
if not berkas:
    st.info("Belum ada berkas di `data/raw/`.")
else:
    st.dataframe(
        [
            {"berkas": p.name, "ukuran (KB)": round(p.stat().st_size / 1024, 1),
             "sudah di-ingest": f"dokumen #{sudah[p.name]}" if p.name in sudah else "belum"}
            for p in berkas
        ],
        width="stretch", hide_index=True,
    )

st.subheader("Ingest berkas")
if not belum:
    st.success("Seluruh berkas di `data/raw/` sudah di-ingest.")
else:
    pilihan = st.selectbox("Berkas", belum, format_func=lambda p: p.name)
    kolom = st.columns(2)
    judul = kolom[0].text_input("Judul dokumen", value=pilihan.stem.replace("-", " ").title())
    jenis = kolom[1].selectbox("Jenis sumber", SOURCE_TYPES)
    partisipan = st.text_input(
        "participant_id",
        help=("Wajib diisi bila dokumen ini akan dianalisis dengan IPA: satu kasus "
              "adalah satu participant_id, dan analisis idiografis memartisi data "
              "berdasarkan nilai ini."),
    )
    catatan = st.text_area(
        "Metadata tambahan (JSON)", value="",
        placeholder='{"durasi_menit": 47, "tanggal": "2026-03-11"}',
    )

    if jenis == "interview_transcript" and not partisipan.strip():
        st.warning(
            "Transkrip tanpa `participant_id` tidak dapat dipakai untuk IPA. "
            "Ingest tetap dapat dilanjutkan bila metode yang dituju bukan IPA."
        )

    if st.button("Ingest", type="primary"):
        try:
            metadata = json.loads(catatan) if catatan.strip() else None
        except json.JSONDecodeError as exc:
            st.error(f"Metadata bukan JSON yang sah: {exc}")
        else:
            try:
                hasil = ingest_document(
                    pilihan.name, title=judul, source_type=jenis,
                    participant_id=partisipan.strip() or None, metadata=metadata,
                )
            except (IngestError, RuntimeError) as exc:
                st.error(str(exc))
            else:
                st.success(
                    f"Dokumen #{hasil['document_id']} tersimpan: {hasil['jumlah_unit']} unit makna "
                    f"dari {hasil['jumlah_blok']} blok."
                )
                st.json(hasil)

st.subheader("Dokumen yang sudah masuk")
if dokumen:
    st.dataframe(dokumen, width="stretch", hide_index=True)
else:
    st.info("Belum ada dokumen.")
