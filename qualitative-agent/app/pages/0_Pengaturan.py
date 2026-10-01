"""Halaman pengaturan kunci akses Anthropic."""

import streamlit as st

from _bootstrap import (api_key_tersedia, catat_galat, db_exists, hapus_kunci,
                        sidebar_footer, simpan_kunci)

st.set_page_config(page_title="Pengaturan", page_icon="🔑", layout="wide")
sidebar_footer()

st.title("Pengaturan")
st.subheader("Kunci akses Anthropic")
st.write(
    "Aplikasi memanggil AI milik Anthropic untuk mengusulkan kode dan tema. Untuk itu "
    "diperlukan sebuah kunci akses pribadi. Buatlah di **platform.claude.com**: masuk, "
    "buka bagian *API Keys*, lalu buat kunci baru dan salin ke kolom di bawah. "
    "Pemakaian AI ditagihkan ke akun Anthropic Anda."
)
st.caption(
    "Kunci disimpan hanya di komputer ini, di dalam folder aplikasi. Kunci tidak pernah "
    "ditampilkan ulang, tidak dicatat di riwayat aplikasi, dan tidak disimpan bersama "
    "data penelitian."
)

# Status diisi di akhir halaman, setelah aksi simpan atau hapus diproses, agar
# selalu mencerminkan keadaan terbaru tanpa memuat ulang halaman.
status_kunci = st.empty()

def _simpan_dari_formulir() -> None:
    """Dijalankan sebelum halaman dimuat ulang.

    Isi kolom kunci langsung dikosongkan dari state sesi, sehingga kunci tidak
    tertahan di memori antarmuka maupun dikirim kembali ke peramban.
    """
    kunci = st.session_state.get("kunci_input", "")
    st.session_state["kunci_input"] = ""
    try:
        simpan_kunci(kunci)
    except ValueError as exc:
        st.session_state["pesan_kunci"] = ("error", str(exc))
    except OSError as exc:
        catat_galat("menyimpan kunci", exc)
        st.session_state["pesan_kunci"] = (
            "error", "Kunci gagal disimpan ke folder aplikasi. Pastikan folder aplikasi "
                     "tidak berada di lokasi yang hanya-baca, lalu coba lagi.")
    else:
        st.session_state["pesan_kunci"] = ("success", "Kunci tersimpan.")


with st.form("simpan_kunci"):
    st.text_input("Tempel kunci akses di sini", type="password",
                  placeholder="sk-ant-...", key="kunci_input")
    st.form_submit_button("Simpan kunci", type="primary", on_click=_simpan_dari_formulir)

pesan = st.session_state.pop("pesan_kunci", None)
if pesan:
    getattr(st, pesan[0])(pesan[1])

kolom = st.columns(2)

if kolom[0].button("Uji kunci", disabled=not api_key_tersedia() or not db_exists(),
                   help="Melakukan satu panggilan sangat singkat ke AI untuk memastikan kunci berfungsi."):
    from config.loader import load_settings
    from src.api_client import call_claude
    from src.audit.audit_logger import log_call

    prompt = "Balas hanya dengan satu kata: siap."
    with st.spinner("Menghubungi Anthropic…"):
        try:
            respons = call_claude(
                prompt,
                model=load_settings().get("model", "claude-sonnet-5"),
                max_tokens=32,
                stage="key_check",
            )
        except RuntimeError as exc:
            catat_galat("uji kunci", exc)
            sebab = exc.__cause__
            try:
                import anthropic
            except ImportError:
                anthropic = None
            if anthropic is not None and isinstance(
                sebab, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)
            ):
                st.error("Kunci ditolak oleh Anthropic. Periksa kembali kunci yang disalin, "
                         "atau buat kunci baru di platform.claude.com.")
            elif anthropic is not None and isinstance(
                sebab, (anthropic.APIConnectionError, anthropic.APITimeoutError)
            ):
                st.error("Tidak dapat menghubungi Anthropic. Periksa sambungan internet, "
                         "lalu coba lagi.")
            elif anthropic is not None and isinstance(sebab, anthropic.RateLimitError):
                st.error("Anthropic sedang membatasi permintaan dari akun ini. Tunggu "
                         "beberapa menit, lalu coba lagi.")
            else:
                st.error("Uji kunci gagal. Rincian teknis tersimpan di folder logs, "
                         "berkas app.log.")
        else:
            # Setiap pemanggilan API dicatat sebelum hasilnya dipakai (CLAUDE.md §4).
            log_call(None, stage="key_check", prompt=prompt, response=respons)
            st.success("Kunci berfungsi. Aplikasi siap memanggil AI.")

if kolom[1].button("Hapus kunci", disabled=not api_key_tersedia()):
    try:
        hapus_kunci()
    except OSError as exc:
        catat_galat("menghapus kunci", exc)
        st.error("Kunci gagal dihapus dari folder aplikasi.")
    else:
        st.success("Kunci dihapus dari komputer ini.")

if api_key_tersedia():
    status_kunci.success("Kunci akses sudah tersimpan.")
else:
    status_kunci.warning("Kunci akses belum diisi. Fitur yang memanggil AI belum dapat dipakai.")
