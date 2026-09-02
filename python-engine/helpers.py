"""
ytdl_modern.helpers  (v12)
──────────────────────────
String formatting and filename sanitization.
"""
from __future__ import annotations

import re
from datetime import datetime


# ── String utilities ───────────────────────────────────────────────────────────

def fmt_date(raw: str) -> str:
    """YYYYMMDD → '04 Jan 2024', or raw on failure."""
    try:
        return datetime.strptime(raw, "%Y%m%d").strftime("%d %b %Y")
    except (ValueError, TypeError):
        return raw or "—"


def truncate(text: str, n: int = 55) -> str:
    if not text:
        return "—"
    return text if len(text) <= n else text[: n - 1] + "…"


def format_size(n: int | float | None) -> str:
    if n is None or n < 0:
        return "—"
    n = float(n)
    if n == 0:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def format_duration(secs: int | float | None) -> str:
    if not secs:
        return "—"
    secs = int(secs)
    h, m = divmod(secs, 3600)
    m, s = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def format_views(n: int | None) -> str:
    """Format view count. Returns '0' for zero (not '—')."""
    if n is None:
        return "—"
    if n == 0:
        return "0"
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
}

def sanitize_filename(name: str) -> str:
    # Strip control characters, zero-width, and bidi override chars
    name = re.sub(r'[\x00-\x1f\x7f\u200b\u200e\u200f\u202a-\u202e]+', "", name)
    # Strip filesystem-forbidden characters
    name = re.sub(r'[\\/:"\*?<>|]+', "", name)
    # Strip leading dots and trailing dots/spaces
    name = name.lstrip(".").strip(". ")
    if not name:
        return "untitled"
    # Replace Windows reserved device names
    base = name.split(".", 1)[0].upper()
    if base in _WINDOWS_RESERVED:
        name = f"_{name}"
    return name


# ── Platform-aware file / folder opener ───────────────────────────────────────
# REMOVED (QUAL-02): open_path/_wsl_open/_linux_open/is_wsl2 were unreachable —
# the web frontend opens files via browser URLs (src/api/transport.ts::openPath),
# never through this Python process.
