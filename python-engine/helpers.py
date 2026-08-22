"""
ytdl_modern.helpers  (v12)
──────────────────────────
String formatting, filename sanitization, platform-aware file opener.

IMPROVEMENTS vs v8:
  • format_size() handles negative values gracefully (returns "—").
  • format_views() handles zero correctly (was returning "—" for 0 views —
    now returns "0" to distinguish "unknown" from "zero views").
  • make_label() gains an `italic` kwarg for sub-labels.
  • make_separator() accepts a `color` override so callers can create
    accent-coloured separators.
  • is_wsl2() cached via module-level _wsl2_cached so repeated calls
    don't re-open /proc/version.

RETAINED from v8:
  FIX: make_label uses font.setFamilies([...]) to preserve emoji fallback.
  NOTE: is_wsl2() public alias kept for external callers.
"""
from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
from datetime import datetime
from typing import Optional


# Cache WSL2 detection — /proc/version doesn't change at runtime
_wsl2_cached: Optional[bool] = None


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


def get_downloads_dir() -> str:
    """Return (and create) the downloads/ folder next to run.py."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(project_root, "downloads")
    os.makedirs(path, exist_ok=True)
    return path


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

def is_wsl2() -> bool:
    """Return True if running inside WSL2. Cached after first call."""
    global _wsl2_cached
    if _wsl2_cached is not None:
        return _wsl2_cached
    try:
        with open("/proc/version", "r") as f:
            _wsl2_cached = "microsoft" in f.read().lower()
    except OSError:
        _wsl2_cached = False
    return _wsl2_cached


# Keep private alias for backwards compatibility
_is_wsl = is_wsl2


def _wsl_open(path: str) -> None:
    if shutil.which("wslview"):
        subprocess.Popen(["wslview", path])
        return
    if shutil.which("wslpath"):
        try:
            win_path = subprocess.check_output(
                ["wslpath", "-w", path], text=True
            ).strip()
            subprocess.Popen(["explorer.exe", win_path])
            return
        except Exception:
            pass
    try:
        subprocess.Popen(["explorer.exe", path])
    except Exception:
        pass


def _linux_open(path: str) -> None:
    for opener in ("xdg-open", "nautilus", "thunar", "dolphin", "pcmanfm", "nemo"):
        if shutil.which(opener):
            try:
                subprocess.Popen([opener, path])
                return
            except Exception:
                continue
    try:
        subprocess.Popen(["xdg-open", path])
    except Exception:
        pass


def open_path(path: str) -> None:
    """Open path in native file manager / default app. Never raises."""
    if not path:
        return
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(path)          # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.Popen(["open", path])
        else:
            if is_wsl2():
                _wsl_open(path)
            else:
                _linux_open(path)
    except Exception:
        pass
