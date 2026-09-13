"""Halaman audit trail."""

import json

import streamlit as st

from _bootstrap import connect, require_db, sidebar_footer

st.set_page_config(page_title="Audit Trail", page_icon="🧾", layout="wide")
sidebar_footer()

st.title("Audit Trail")
st.caption(
    "Setiap pemanggilan Anthropic API tercatat di sini, termasuk pemanggilan yang gagal. "
    "Jejak ini adalah dasar dependability dan confirmability (Lincoln & Guba)."
)

if not require_db():
    st.stop()

conn = connect()
try:
    baris = conn.execute(
        """
        SELECT a.id, a.method_run_id, mr.method, a.stage, a.model_used,
               a.input_tokens, a.output_tokens, a.called_at,
               a.prompt_text, a.response_text
        FROM audit_log a LEFT JOIN method_runs mr ON mr.id = a.method_run_id
        ORDER BY a.id DESC
        """
    ).fetchall()
finally:
    conn.close()

if not baris:
    st.info("Belum ada pemanggilan API yang tercatat.")
    st.stop()

tahap = sorted({r["stage"] for r in baris})
pilih_tahap = st.multiselect("Saring tahap", tahap, default=tahap)
hanya_gagal = st.checkbox("Hanya tampilkan pemanggilan yang gagal", value=False)

terpilih = [
    r for r in baris
    if r["stage"] in pilih_tahap
    and (not hanya_gagal or r["response_text"].startswith("[CALL_FAILED]"))
]

total_in = sum(r["input_tokens"] or 0 for r in terpilih)
total_out = sum(r["output_tokens"] or 0 for r in terpilih)
gagal = sum(1 for r in terpilih if r["response_text"].startswith("[CALL_FAILED]"))

kolom = st.columns(4)
kolom[0].metric("pemanggilan", len(terpilih))
kolom[1].metric("gagal", gagal)
kolom[2].metric("token masukan", total_in)
kolom[3].metric("token keluaran", total_out)

st.dataframe(
    [
        {k: r[k] for k in ("id", "method_run_id", "method", "stage", "model_used",
                           "input_tokens", "output_tokens", "called_at")}
        for r in terpilih
    ],
    width="stretch",
    hide_index=True,
)

st.subheader("Rincian pemanggilan")
for r in terpilih[:50]:
    penanda = "GAGAL · " if r["response_text"].startswith("[CALL_FAILED]") else ""
    with st.expander(f"{penanda}#{r['id']} · {r['stage']} · {r['called_at']}"):
        st.markdown("**Prompt yang dikirim**")
        st.code(r["prompt_text"], language="text")
        st.markdown("**Respons mentah**")
        st.code(r["response_text"], language="text")

st.download_button(
    "Unduh audit trail terpilih (JSONL)",
    "\n".join(json.dumps(dict(r), ensure_ascii=False) for r in terpilih),
    file_name="audit-trail.jsonl",
    mime="application/x-ndjson",
)
