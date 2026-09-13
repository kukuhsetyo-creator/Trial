"""Pemuat konfigurasi metode dan pengaturan global.

Konfigurasi adalah tempat seluruh perbedaan epistemologis antartradisi berada.
Pemuat ini karenanya bersikap ketat: berkas metode yang tidak memuat kunci wajib
ditolak saat dimuat, bukan dibiarkan gagal jauh di dalam modul coding ketika
prompt ternyata tidak ada.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(__file__).resolve().parent
METHODS_DIR = CONFIG_DIR / "methods"
SETTINGS_PATH = CONFIG_DIR / "settings.yaml"

KNOWN_METHODS = ("ta_classic", "rta", "ipa", "grounded_theory")
REQUIRED_KEYS = ("method", "display_name", "stages", "prompts", "required_human_review")


class ConfigError(ValueError):
    """Konfigurasi metode tidak memenuhi bentuk minimum yang disyaratkan."""


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path.name} gagal diurai: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"{path.name} tidak berisi pemetaan kunci-nilai.")
    return data


def normalize_stages(stages: Any) -> tuple[list[str], dict[str, Any]]:
    """Memisahkan nama tahap dari flag yang terselip di dalam daftar ``stages``.

    Spesifikasi menuliskan ``reflexive_memo_required: true`` sebagai elemen di
    dalam daftar tahap, padahal ia flag dan bukan tahap. Pemuat memisahkan
    keduanya agar konsumen dapat mengiterasi tahap tanpa tersandung dict, tanpa
    menuntut berkas YAML diubah dari bentuk yang tertulis di spesifikasi.
    """
    names: list[str] = []
    flags: dict[str, Any] = {}
    for item in stages or []:
        if isinstance(item, dict):
            flags.update(item)
        else:
            names.append(str(item))
    return names, flags


def validate_method_config(config: dict[str, Any], sumber: str) -> dict[str, Any]:
    missing = [key for key in REQUIRED_KEYS if key not in config]
    if missing:
        raise ConfigError(f"{sumber} tidak memuat kunci wajib: {', '.join(missing)}")
    if config["method"] not in KNOWN_METHODS:
        raise ConfigError(
            f"{sumber} menyebut method '{config['method']}' yang tidak dikenal; "
            f"nilai yang sah: {', '.join(KNOWN_METHODS)}"
        )
    if not isinstance(config.get("prompts"), dict) or not config["prompts"]:
        raise ConfigError(f"{sumber} tidak memuat satu pun prompt.")

    stage_names, stage_flags = normalize_stages(config.get("stages"))
    config = dict(config)
    config["stage_names"] = stage_names
    config["stage_flags"] = stage_flags
    return config


@lru_cache(maxsize=1)
def load_settings() -> dict[str, Any]:
    return _read_yaml(SETTINGS_PATH) if SETTINGS_PATH.exists() else {}


def load_method_config(method: str) -> dict[str, Any]:
    """Memuat konfigurasi satu metode, dengan nilai global sebagai cadangan."""
    path = METHODS_DIR / f"{method}.yaml"
    if not path.exists():
        raise ConfigError(f"Konfigurasi untuk metode '{method}' tidak ada di {METHODS_DIR}.")
    config = validate_method_config(_read_yaml(path), path.name)

    settings = load_settings()
    for key in ("model", "max_tokens"):
        if key not in config and key in settings:
            config[key] = settings[key]
    return config


def load_all_method_configs() -> dict[str, dict[str, Any]]:
    configs: dict[str, dict[str, Any]] = {}
    for path in sorted(METHODS_DIR.glob("*.yaml")):
        config = load_method_config(path.stem)
        configs[config["method"]] = config
    return configs
