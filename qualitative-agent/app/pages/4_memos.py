"""Halaman memo reflektif."""

import streamlit as st

from _bootstrap import connect, require_db, sidebar_footer

st.set_page_config(page_title="Memo", page_icon="📝", layout="wide")
sidebar_footer()

st.title("Memo Reflektif")
st.caption(
    "Memo tulisan peneliti tersimpan dengan `created_by = 'human'` dan tidak pernah "
    "tercampur dengan memo yang dihasilkan model."
)

if not require_db():
    st.stop()

conn = connect()
try:
    runs = [dict(r) for r in conn.execute(
        "SELECT id, method, project_label FROM method_runs ORDER BY id DESC"
    ).fetchall()]
finally:
    conn.close()

if not runs:
    st.info("Belum ada sesi analisis. Memo selalu terikat pada satu sesi analisis.")
    st.stop()

run = st.selectbox(
    "Sesi analisis", runs,
    format_func=lambda r: f"#{r['id']} · {r['method']} · {r['project_label']}",
)

with st.form("memo_baru", clear_on_submit=True):
    isi = st.text_area(
        "Memo baru",
        height=180,
        placeholder=(
            "Catat keputusan interpretatif, keraguan, posisionalitas, atau alasan sebuah "
            "kode terasa tidak pas. Memo adalah tempat refleksivitas terekam, bukan tempat "
            "merangkum data."
        ),
    )
    if st.form_submit_button("Simpan memo", type="primary") and isi.strip():
        conn = connect()
        try:
            conn.execute(
                "INSERT INTO memos (method_run_id, content, created_by) VALUES (?, ?, 'human')",
                (run["id"], isi.strip()),
            )
            conn.commit()
        finally:
            conn.close()
        st.success("Memo tersimpan.")

st.subheader("Memo pada sesi ini")
conn = connect()
try:
    memos = conn.execute(
        """
        SELECT id, content, created_by, created_at, related_code_id, related_category_id
        FROM memos WHERE method_run_id = ? ORDER BY id DESC
        """,
        (run["id"],),
    ).fetchall()
finally:
    conn.close()

if not memos:
    st.info("Belum ada memo pada sesi ini.")
for memo in memos:
    penanda = "peneliti" if memo["created_by"] == "human" else "model"
    with st.container(border=True):
        st.caption(f"#{memo['id']} · ditulis {penanda} · {memo['created_at']}")
        st.write(memo["content"])

st.divider()
st.caption(
    "Pembangkitan memo otomatis oleh model menunggu `src/memo/memo_writer.py`, "
    "yang belum dibangun."
)
