"""Halaman coding inisial."""

import json
import os

import streamlit as st

from _bootstrap import connect, load_method_configs, require_db, sidebar_footer

st.set_page_config(page_title="Open Coding", page_icon="🏷️", layout="wide")
sidebar_footer()

st.title("Coding Inisial")

if not require_db():
    st.stop()

configs = load_method_configs()
if not configs:
    st.error("Tidak ada konfigurasi metode di `config/methods/`.")
    st.stop()

conn = connect()
try:
    runs = [dict(r) for r in conn.execute(
        "SELECT id, method, project_label FROM method_runs ORDER BY id DESC"
    ).fetchall()]
    units = [dict(r) for r in conn.execute(
        """
        SELECT u.id, u.sequence_index, u.text, d.title, d.participant_id
        FROM units u JOIN documents d ON d.id = u.document_id
        ORDER BY d.id, u.sequence_index
        """
    ).fetchall()]
finally:
    conn.close()

if not runs or not units:
    st.info(
        "Halaman ini memerlukan sekurang-kurangnya satu sesi analisis dan satu unit makna. "
        "Keduanya lahir dari lapisan ingest yang belum dibangun (langkah 2), sehingga untuk "
        "sementara hanya dapat diisi lewat basis data secara langsung."
    )
    st.stop()

run = st.selectbox(
    "Sesi analisis", runs,
    format_func=lambda r: f"#{r['id']} · {r['method']} · {r['project_label']}",
)
metode = run["method"]
if metode not in configs:
    st.error(f"Konfigurasi untuk metode `{metode}` tidak ditemukan di `config/methods/`.")
    st.stop()

cfg = configs[metode]
st.caption(f"Metode aktif: **{cfg.get('display_name', metode)}**")
if cfg.get("philosophy"):
    with st.expander("Komitmen epistemologis metode ini"):
        st.write(cfg["philosophy"])

unit = st.selectbox(
    "Unit makna", units,
    format_func=lambda u: f"[{u['title']} · {u['sequence_index']}] {u['text'][:70]}",
)
st.text_area("Teks unit", unit["text"], disabled=True)
konteks = st.text_input(
    "Konteks dokumen",
    value=f"{unit['title']}" + (f" · partisipan {unit['participant_id']}" if unit["participant_id"] else ""),
)

if not os.environ.get("ANTHROPIC_API_KEY"):
    st.warning(
        "`ANTHROPIC_API_KEY` belum diset, sehingga pemanggilan model tidak dapat dilakukan. "
        "Salin `.env.example` menjadi `.env` dan isi kuncinya."
    )

if st.button("Usulkan kode untuk unit ini", type="primary",
             disabled=not os.environ.get("ANTHROPIC_API_KEY")):
    from src.coding.open_coding import generate_initial_codes

    with st.spinner("Memanggil model dan mencatat audit trail..."):
        try:
            proposals = generate_initial_codes(
                unit_text=unit["text"],
                document_context=konteks,
                method_config=cfg,
                method_run_id=run["id"],
            )
        except Exception as exc:  # noqa: BLE001 - ditampilkan apa adanya ke peneliti
            st.error(f"Pemanggilan gagal: {exc}")
            st.caption("Kegagalan tetap tercatat pada audit trail.")
        else:
            st.session_state["proposals"] = proposals

proposals = st.session_state.get("proposals")
if proposals:
    st.subheader("Proposal kode")
    st.dataframe(proposals, width="stretch", hide_index=True)
    st.warning(
        "Proposal ini **belum tersimpan** ke tabel `codes`. Lapisan persistensi kode belum "
        "dibangun, dan menuliskannya langsung dari antarmuka akan menempatkan logika basis "
        "data di tempat yang salah. Unduh sebagai JSON bila perlu disimpan sementara."
    )
    st.download_button(
        "Unduh proposal (JSON)",
        json.dumps(proposals, ensure_ascii=False, indent=2),
        file_name=f"proposal-kode-run{run['id']}-unit{unit['id']}.json",
        mime="application/json",
    )
