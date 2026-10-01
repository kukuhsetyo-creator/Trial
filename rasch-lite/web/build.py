"""Bangun RaschLite.html: satu berkas mandiri berisi aplikasi, teks, data contoh, dan logo.

Jalankan dari folder rasch-lite:  .venv/bin/python web/build.py
Teks, label, ambang, glosarium, dan teks grafik diekspor langsung dari paket Python
(web/tools/export_text.py) sehingga identik dengan versi desktop.
"""

from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent
ROOT = WEB.parent
sys.path.insert(0, str(WEB / "tools"))
sys.path.insert(0, str(ROOT / "src"))

import export_text  # noqa: E402
from PIL import Image  # noqa: E402

from raschlite.resources import BRAND_DIR, SAMPLES, sample_path  # noqa: E402


def _js_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def _icon_uri() -> str:
    img = Image.open(BRAND_DIR / "raschlite_icon.png").convert("RGBA").resize((64, 64), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def build(out: Path) -> Path:
    text = export_text.build()
    samples = {k: {"file": v["file"], "csv": sample_path(k).read_text(encoding="utf-8-sig")} for k, v in SAMPLES.items()}
    logo = "data:image/png;base64," + base64.b64encode((BRAND_DIR / "csps_logo.png").read_bytes()).decode("ascii")
    parts = {name: (WEB / "src" / f"{name.lower()}.js").read_text(encoding="utf-8")
             for name in ("ENGINE", "INTERPRET", "CHARTS", "XLSX", "APP")}
    for name, src in parts.items():
        if "</script" in src.lower():
            raise SystemExit(f"{name}: kode tidak boleh memuat '</script'")
    html = (WEB / "src" / "index.html").read_text(encoding="utf-8")
    replacements = {
        "__VERSION__": text["version"], "__ICON__": _icon_uri(), "__CSS__": (WEB / "src" / "style.css").read_text(encoding="utf-8"),
        "__TEXT__": _js_json(text), "__SAMPLES__": _js_json(samples), "__LOGO__": logo,
        **{f"__{k}__": v for k, v in parts.items()},
    }
    for key, value in replacements.items():
        if key not in html:
            raise SystemExit(f"penanda {key} tidak ada di index.html")
        html = html.replace(key, value)
    out.write_text(html, encoding="utf-8")
    (WEB / "build").mkdir(exist_ok=True)
    (WEB / "build" / "text.json").write_text(json.dumps(text, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


if __name__ == "__main__":
    path = build(Path(sys.argv[1]) if len(sys.argv) > 1 else WEB / "RaschLite.html")
    print(f"{path} ({path.stat().st_size / 1024:.0f} KB)")
