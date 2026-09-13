"""Pembungkus Anthropic API dengan retry dan exponential backoff.

Modul ini tidak mengetahui metode analisis mana pun. Ia menerima prompt yang
sudah jadi, memanggil model, dan mengembalikan respons beserta metadata yang
diperlukan audit trail. Seluruh interpretasi isi respons adalah urusan modul
pemanggil.

Pemanggilan yang berhasil TIDAK dicatat di sini, melainkan oleh fungsi pemanggil
lewat ``audit_logger.log_call`` sebelum ia mengembalikan hasil ke caller-nya
(CLAUDE.md §4). Pemanggilan yang gagal total dicatat di sini, karena kegagalan
tidak pernah sampai ke pemanggil dan karenanya tidak dapat dicatat olehnya.
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass
from typing import Any

DEFAULT_MODEL = "claude-sonnet-5"
DEFAULT_MAX_TOKENS = 2048
MAX_ATTEMPTS = 4
BASE_BACKOFF_SECONDS = 2.0


@dataclass(frozen=True)
class ClaudeResponse:
    """Respons mentah beserta metadata biaya, siap diserahkan ke audit trail."""

    text: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    stop_reason: str | None = None


def _build_client() -> Any:
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - bergantung lingkungan
        raise RuntimeError(
            "Paket 'anthropic' belum terpasang. Jalankan: pip install -r requirements.txt"
        ) from exc

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY belum diset. Salin .env.example menjadi .env dan isi kuncinya."
        )
    return anthropic.Anthropic(api_key=api_key)


def _is_retryable(exc: BaseException) -> bool:
    name = type(exc).__name__
    if name in {"RateLimitError", "APIConnectionError", "APITimeoutError", "InternalServerError"}:
        return True
    status = getattr(exc, "status_code", None)
    return status is not None and (status == 429 or status >= 500)


def call_claude(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    system: str | None = None,
    method_run_id: int | None = None,
    stage: str = "unspecified",
    client: Any | None = None,
) -> ClaudeResponse:
    """Memanggil model sekali, dengan retry pada kegagalan yang bersifat sementara.

    ``method_run_id`` dan ``stage`` hanya dipakai untuk mencatat kegagalan total
    ke audit trail; keduanya tidak memengaruhi isi pemanggilan.
    """
    from src.audit.audit_logger import log_failure

    client = client or _build_client()
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system

    last_error: BaseException | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            message = client.messages.create(**kwargs)
        except BaseException as exc:  # noqa: BLE001 - diklasifikasi ulang di bawah
            last_error = exc
            if not _is_retryable(exc) or attempt == MAX_ATTEMPTS:
                break
            delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            time.sleep(delay + random.uniform(0, 0.5))
            continue

        text = "".join(
            block.text for block in message.content if getattr(block, "type", None) == "text"
        )
        usage = getattr(message, "usage", None)
        return ClaudeResponse(
            text=text,
            model=getattr(message, "model", model),
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            stop_reason=getattr(message, "stop_reason", None),
        )

    log_failure(
        method_run_id,
        stage=stage,
        prompt=prompt,
        model=model,
        error=last_error,
        attempts=MAX_ATTEMPTS if _is_retryable(last_error) else 1,
    )
    raise RuntimeError(f"Pemanggilan Anthropic API gagal pada stage '{stage}': {last_error}") from last_error
