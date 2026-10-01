#!/bin/sh
# Mulai Aplikasi - Agen Analisis Kualitatif (Linux)

ROOT="$(cd "$(dirname "$0")" && pwd)"
JUDUL="Agen Analisis Kualitatif"

pesan() {
    if command -v zenity >/dev/null 2>&1; then
        zenity --warning --title="$JUDUL" --text="$1" >/dev/null 2>&1
    elif command -v kdialog >/dev/null 2>&1; then
        kdialog --title "$JUDUL" --sorry "$1" >/dev/null 2>&1
    elif command -v notify-send >/dev/null 2>&1; then
        notify-send "$JUDUL" "$1"
    fi
    echo "$1" >&2
}

PY=""
for c in python3.14 python3.13 python3.12 python3.11 python3; do
    command -v "$c" >/dev/null 2>&1 || continue
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
        PY="$(command -v "$c")"
        break
    fi
done

if [ -z "$PY" ]; then
    pesan "Aplikasi ini memerlukan Python 3.11 atau yang lebih baru. Pasang Python lewat pengelola aplikasi sistem Anda, lalu jalankan Mulai Aplikasi lagi."
    command -v xdg-open >/dev/null 2>&1 && xdg-open "https://www.python.org/downloads/" >/dev/null 2>&1
    exit 1
fi

cd "$ROOT" || exit 1
exec "$PY" "$ROOT/launcher/launcher.pyw" "$@"
