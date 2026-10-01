"""Ekspor semua teks dan ambang dari paket Python ke JSON untuk versi HTML.

Dengan begitu pesan engine, label, glosarium, ambang interpretasi, rujukan, dan teks
"Cara membaca grafik ini" pada versi HTML identik dengan versi desktop.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from raschlite import APP_NAME, __version__, theme  # noqa: E402
from raschlite.core import messages  # noqa: E402
from raschlite.core.analysis import STATUS_LABELS  # noqa: E402
from raschlite.core.categories import ALL_ITEMS  # noqa: E402
from raschlite.gui import strings  # noqa: E402
from raschlite.interpret import glossary, narrative, rules  # noqa: E402
from raschlite.plots.gallery import CHARTS  # noqa: E402
from raschlite.report import common  # noqa: E402


def _upper(module) -> dict:
    out = {}
    for k, v in vars(module).items():
        if k.isupper() and isinstance(v, (str, int, float, list, tuple, dict)):
            out[k] = list(v) if isinstance(v, tuple) else v
    return out


class _Model:
    def __init__(self, model):
        self.model = model


def build() -> dict:
    return {
        "app": APP_NAME,
        "version": __version__,
        "messages": _upper(messages),
        "statusLabels": {str(k): v for k, v in STATUS_LABELS.items()},
        "allItems": ALL_ITEMS,
        "rules": _upper(rules),
        "strings": _upper(strings),
        "common": _upper(common),
        "theme": _upper(theme),
        "modelNames": narrative.MODEL_NAMES,
        "lightStatus": narrative.STATUS_LABELS,
        "maxListed": narrative.MAX_LISTED,
        "glossary": {k: {"term": t.term, "short": t.short, "long": t.long} for k, t in glossary.GLOSSARY.items()},
        "charts": [{"key": c.key, "title": c.title, "perItem": c.per_item,
                    "howToRead": {"dichotomous": c.how_to_read(_Model("dichotomous")),
                                  "polytomous": c.how_to_read(_Model("pcm"))}} for c in CHARTS],
    }


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "build" / "text.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=1), encoding="utf-8")
    print(out)
