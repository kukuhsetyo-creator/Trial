"""Halaman pembentukan tema dan antrean peninjauan manusia."""

import streamlit as st

from _bootstrap import api_key_tersedia, connect, require_db, sidebar_footer

st.set_page_config(page_title="Kategorisasi", page_icon="🗃️", layout="wide")
sidebar_footer()

st.title("Tema dan Peninjauan")

if not require_db():
    st.stop()

from src.coding import rta  # noqa: E402
from src.store import codes_for_category, fetch_categories  # noqa: E402
from src.validation import review_queue  # noqa: E402

conn = connect()
try:
    runs = [dict(r) for r in conn.execute(
        "SELECT id, method, project_label FROM method_runs ORDER BY id DESC"
    ).fetchall()]
finally:
    conn.close()

if not runs:
    st.info("Belum ada sesi analisis.")
    st.stop()

run = st.selectbox("Sesi analisis", runs,
                   format_func=lambda r: f"#{r['id']} · {r['method']} · {r['project_label']}")
run_id = run["id"]

ringkasan = review_queue.summary(run_id)
kolom = st.columns(4)
kolom[0].metric("kode proposed", ringkasan["code"].get("proposed", 0))
kolom[1].metric("kode validated", ringkasan["code"].get("validated", 0))
kolom[2].metric("kode revised", ringkasan["code"].get("revised", 0))
kolom[3].metric("kode rejected", ringkasan["code"].get("rejected", 0))

tab_tema, tab_kode = st.tabs(["Pembentukan tema", "Antrean peninjauan"])

with tab_tema:
    if run["method"] != "rta":
        st.info(
            f"Modul pembentukan tema untuk metode `{run['method']}` belum dibangun. "
            "Saat ini hanya RTA yang memiliki modulnya sendiri di `src/coding/rta.py`."
        )
    else:
        punya_kunci = bool(api_key_tersedia())
        if not punya_kunci:
            st.warning("`ANTHROPIC_API_KEY` belum diset; tahap yang memanggil model dinonaktifkan.")

        aksi = st.columns(3)
        if aksi[0].button("Bentuk tema", disabled=not punya_kunci):
            try:
                hasil = rta.generate_themes(run_id)
            except Exception as exc:  # noqa: BLE001
                st.error(str(exc))
            else:
                st.success(f"{len(hasil['tema'])} tema terbentuk, seluruhnya berstatus `proposed`.")
        if aksi[1].button("Tinjau tema", disabled=not punya_kunci):
            try:
                hasil = rta.review_themes(run_id)
            except Exception as exc:  # noqa: BLE001
                st.error(str(exc))
            else:
                st.info(hasil["penilaian"])
        if aksi[2].button("Namai dan definisikan", disabled=not punya_kunci):
            try:
                hasil = rta.define_and_name_themes(run_id)
            except rta.ReflexivityRequired as exc:
                st.error(str(exc))
                st.caption("Tulis memo Anda sendiri di halaman Memo, lalu ulangi tahap ini.")
            except Exception as exc:  # noqa: BLE001
                st.error(str(exc))
            else:
                st.success(f"{len(hasil['tema_dinamai'])} tema dinamai ulang.")

        st.caption(
            "Hitungan frekuensi kode tidak pernah dikirim ke model pada tahap pembentukan "
            "tema. Pada RTA prevalensi bukan argumen bagi sebuah tema."
        )

    st.subheader("Tema pada sesi ini")
    tema = fetch_categories(run_id, category_types=("theme", "subtheme"))
    if not tema:
        st.info("Belum ada tema.")
    for t in tema:
        with st.container(border=True):
            st.markdown(f"**[{t['id']}] {t['label']}** · status `{t['status']}`")
            if t["definition"]:
                st.write(t["definition"])
            kode = codes_for_category(t["id"])
            if kode:
                with st.expander(f"{len(kode)} kode tertaut"):
                    for k in kode:
                        st.markdown(f"- `{k['status']}` **{k['label']}** — \"{k['unit_text'][:160]}\"")
            if t["status"] == "proposed":
                aksi = st.columns(3)
                catatan = st.text_input("Catatan peninjau", key=f"cat-note-{t['id']}")
                if aksi[0].button("Sahkan", key=f"cat-v-{t['id']}"):
                    review_queue.validate("category", t["id"], reviewer_note=catatan or None)
                    st.rerun()
                label_baru = aksi[1].text_input("Label baru", key=f"cat-l-{t['id']}")
                if aksi[1].button("Revisi", key=f"cat-r-{t['id']}"):
                    try:
                        review_queue.revise("category", t["id"], new_label=label_baru,
                                            reviewer_note=catatan or None)
                    except review_queue.ReviewError as exc:
                        st.error(str(exc))
                    else:
                        st.rerun()
                if aksi[2].button("Tolak", key=f"cat-x-{t['id']}"):
                    review_queue.reject("category", t["id"], reviewer_note=catatan or None)
                    st.rerun()

with tab_kode:
    st.caption(
        "Perubahan status hanya terjadi di sini, lewat `src/validation/review_queue.py`, "
        "dan setiap tindakan tercatat pada tabel `validation_events`."
    )
    antre = review_queue.pending(run_id, target_type="code")
    if not antre:
        st.success("Tidak ada kode berstatus `proposed` yang menunggu peninjauan.")
    for kode in antre[:60]:
        with st.container(border=True):
            st.markdown(f"**[{kode['id']}] {kode['label']}**")
            st.caption(f"{kode['document_title']} · {kode['speaker'] or 'tanpa penutur'}")
            st.write(f"> {kode['unit_text']}")
            if kode["justification"]:
                st.caption(f"Justifikasi model: {kode['justification']}")
            catatan = st.text_input("Catatan peninjau", key=f"note-{kode['id']}")
            label_baru = st.text_input("Label hasil revisi", key=f"label-{kode['id']}")
            aksi = st.columns(3)
            if aksi[0].button("Sahkan", key=f"v-{kode['id']}"):
                review_queue.validate("code", kode["id"], reviewer_note=catatan or None)
                st.rerun()
            if aksi[1].button("Revisi", key=f"r-{kode['id']}"):
                try:
                    review_queue.revise("code", kode["id"], new_label=label_baru,
                                        reviewer_note=catatan or None)
                except review_queue.ReviewError as exc:
                    st.error(str(exc))
                else:
                    st.rerun()
            if aksi[2].button("Tolak", key=f"x-{kode['id']}"):
                review_queue.reject("code", kode["id"], reviewer_note=catatan or None)
                st.rerun()
