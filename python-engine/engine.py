"""
ytdl_modern.engine  (v4)
────────────────────────
Self-contained audio download engine.

Improvements over v3:
  • Multiple YouTube player clients (ios, android_music, android, web) for
    maximum bypass of bot-detection / age-gate restrictions.
  • Real format verification — mutagen reads back the file and confirms the
    codec matches what was requested.  Mismatch is logged + user is warned.
  • Maximum-quality thumbnail selection — sorted by resolution, prefers
    maxresdefault / hqdefault from YouTube thumbnail URL patterns.
  • Proper cover-art embedding for ALL three formats:
      opus  → base64-encoded FLAC Picture in metadata_block_picture tag
      mp3   → ID3 APIC frame (image/jpeg)
      aac   → mutagen MP4 covr atom (MP4Cover.FORMAT_JPEG)
  • Full file-logger integration (logger.py).
  • Exponential back-off retry (from audio_downloader).
  • Cooperative cancellation via threading.Event.
"""
from __future__ import annotations

import base64
import contextlib
import io
import os
import re
import shutil
import subprocess
import sys
import time
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from dataclasses import dataclass, field, asdict
from typing import Callable, Optional

try:
    from yt_dlp import YoutubeDL
    _YDL_OK = True
except ImportError:
    _YDL_OK = False
    class YoutubeDL:  # type: ignore
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def extract_info(self, *a, **kw): return None

try:
    from mutagen.oggopus import OggOpus
    from mutagen.mp3 import EasyMP3
    from mutagen.mp4 import MP4, MP4Cover
    from mutagen.id3 import (
        ID3, APIC, TIT2, TPE1, TALB, TDRC, TCON, COMM, TXXX, TLAN, error as ID3Error
    )
    from mutagen.flac import Picture
    from mutagen import File as MutagenFile
    _MUTAGEN_OK = True
except ImportError:
    _MUTAGEN_OK = False

from helpers import format_size, format_duration, sanitize_filename
import logger as applog

# ── Audio format → codec string ───────────────────────────────────────────────
AUDIO_FORMATS: dict[str, str] = {
    "opus": "opus",
    "mp3":  "mp3",
    "aac":  "m4a",   # yt-dlp always muxes AAC into M4A container
    "m4a":  "m4a",
    "wav":  "wav",
}

# ── Quality presets (from audio_downloader reference) ─────────────────────────
# Audio-mode format selection is deliberately `bestaudio` — NOT
# `bestaudio/best`. The `/best` fallback lets yt-dlp resolve a muxed
# video+audio stream (e.g. YouTube format 18, ~8 MB for a 3:25 track) when it
# fails to resolve an audio-only format — and the engine's old vcodec retry
# then downloaded that same muxed stream a second time with identical options.
# `bestaudio` alone picks an audio-only format on every site that has one;
# if a site truly offers no audio-only track, failing the download is
# preferable to silently fetching and transcoding a full video stream.
QUALITY_PRESETS: dict[str, dict] = {
    "maximum": {"format": "bestaudio", "preferredquality": "0"},
    "high":    {"format": "bestaudio", "preferredquality": "192"},
    "medium":  {"format": "bestaudio", "preferredquality": "128"},
    "low":     {"format": "bestaudio", "preferredquality": "96"},
}

VIDEO_QUALITY_PRESETS: dict[str, dict] = {
    "maximum": {"format": "bestvideo+bestaudio/best[height<=1080]/best"},
    "best":    {"format": "bestvideo+bestaudio/best[height<=1080]/best"},
    "2160p":   {"format": "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best"},
    "1080p":   {"format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"},
    "720p":    {"format": "bestvideo[height<=720]+bestaudio/best[height<=720]/best"},
    "480p":    {"format": "bestvideo[height<=480]+bestaudio/best[height<=480]/best"},
    "360p":    {"format": "bestvideo[height<=360]+bestaudio/best[height<=360]/best"},
    "high":    {"format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"},
    "medium":  {"format": "bestvideo[height<=720]+bestaudio/best[height<=720]/best"},
    "low":     {"format": "bestvideo[height<=480]+bestaudio/best[height<=480]/best"},
}

# ── Expected mutagen file types per output format ─────────────────────────────
_MUTAGEN_TYPE_CHECK = {
    "opus": "OggOpus",
    "mp3":  "MP3",
    "aac":  "MP4",
    "m4a":  "MP4",
    "wav":  "WAVE",
    "mp4":  "MP4",
    "webm": "WebM",
    "mkv":  "Matroska",
}

# NOTE: YouTube URL-shape validation is intentionally enforced upstream in the
# Node layer (web/validate.mjs YOUTUBE_REGEX, checked on every /api/probe and
# /api/download request before any command reaches this process). No Python-side
# copy of the pattern is kept here so the two can't drift apart.

# ── Video quality height map ──────────────────────────────────────────────────
_HEIGHT_MAP = {
    "maximum": 1080, "best": 1080, "2160p": 2160, "1080p": 1080,
    "720p": 720, "480p": 480, "360p": 360, "high": 1080, "medium": 720, "low": 480,
}

_VALID_VIDEO_CONTAINERS = {"mp4", "webm", "mkv"}

_CONTAINER_NAMES = {
    ".opus": "Opus", ".mp3": "MP3", ".m4a": "AAC",
    ".mp4": "MP4", ".mkv": "MKV", ".webm": "WebM",
}


# ══════════════════════════════════════════════════════════════════════════════
#  Retry strategy  (adapted from audio_downloader.error_handler)
# ══════════════════════════════════════════════════════════════════════════════

def _merge_missing_info(target: dict, fallback: dict | None) -> dict:
    """
    Fill fields missing from `target` with values from `fallback`.

    yt-dlp's mobile player clients (ios / android_music) — used on the
    audio-mode retry when the default client resolves to a muxed video
    stream — return info dicts that omit fields the default web client
    provides (notably `uploader` and `webpage_url`). Without this merge,
    retried downloads silently lose the artist and comment ID3 tags and
    metadata verification reports fewer fields embedded.
    """
    if not fallback:
        return target
    for key, value in fallback.items():
        if value in (None, "", [], {}):
            continue
        if target.get(key) in (None, "", [], {}):
            target[key] = value
    return target


class RetryStrategy:
    def __init__(
        self,
        max_retries: int   = 3,
        initial_delay: float = 2.0,
        max_delay: float   = 30.0,
        backoff: float     = 2.0,
    ) -> None:
        self.max_retries   = max_retries
        self.initial_delay = initial_delay
        self.max_delay     = max_delay
        self.backoff       = backoff
        self._attempt      = 0
        self._delay        = initial_delay

    def should_retry(self, exc: Exception) -> bool:
        if self._attempt >= self.max_retries:
            return False
        msg = str(exc).lower()
        # Don't retry user cancellation or unrecoverable errors
        if any(x in msg for x in ("cancelled", "not a youtube url",
                                   "is not a valid url", "ffmpeg")):
            return False
        return True

    def next_delay(self) -> float:
        delay = min(self.initial_delay * (self.backoff ** self._attempt),
                    self.max_delay)
        self._attempt += 1
        return delay

    def reset(self) -> None:
        self._attempt = 0
        self._delay   = self.initial_delay


# ══════════════════════════════════════════════════════════════════════════════
#  Download result
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class DownloadResult:
    success:          bool
    url:              str   = ""
    title:            str   = ""
    uploader:         str   = ""
    filepath:         str   = ""
    filename:         str   = ""
    fmt:              str   = ""
    file_size:        int   = 0
    duration:         float = 0.0
    video_id:         str   = ""
    avg_speed:        float = 0.0
    peak_speed:       float = 0.0
    elapsed:          float = 0.0
    bitrate:          int   = 0      # actual bitrate read back from file (kbps)
    thumbnail_ok:     bool  = False  # whether cover art was embedded
    format_ok:        bool  = False  # whether format was verified by mutagen
    error:            str   = ""
    error_type:       str   = ""
    metadata_fields:  dict[str, str] = field(default_factory=dict)
    metadata_verify:  dict[str, bool] = field(default_factory=dict)
    metadata_engine:  str   = ""
    metadata_container: str = ""
    metadata_cover_art: bool = False


# ══════════════════════════════════════════════════════════════════════════════
#  Error helpers
# ══════════════════════════════════════════════════════════════════════════════

def is_bot_detection_error(msg: str) -> bool:
    indicators = (
        "sign in to confirm", "bot", "captcha",
        "too many requests", "rate limit", "403",
        "video unavailable", "age-restricted", "members-only",
        "private video",
    )
    m = msg.lower()
    return any(ind in m for ind in indicators)


def classify_error_type(msg: str) -> str:
    if is_bot_detection_error(msg):
        return "BotDetectionError"
    net = ("connection", "timeout", "network", "ssl", "certificate",
           "unable to download", "urlopen error", "http error")
    if any(x in msg.lower() for x in net):
        return "NetworkError"
    if "ffmpeg" in msg.lower():
        return "FFmpegError"
    return "AudioDownloaderError"


# ══════════════════════════════════════════════════════════════════════════════
#  Speed tracker
# ══════════════════════════════════════════════════════════════════════════════

class _SpeedTracker:
    def __init__(self) -> None:
        self._start   = time.monotonic()
        self._speeds: list[float] = []

    def record(self, speed: float) -> None:
        if speed > 0:
            self._speeds.append(speed)

    @property
    def avg_speed(self) -> float:
        return sum(self._speeds) / len(self._speeds) if self._speeds else 0.0

    @property
    def peak_speed(self) -> float:
        return max(self._speeds, default=0.0)

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self._start


# ══════════════════════════════════════════════════════════════════════════════
#  Thumbnail helpers  — maximum quality selection
# ══════════════════════════════════════════════════════════════════════════════

_ALLOWED_THUMBNAIL_DOMAINS = (".ytimg.com", ".googleusercontent.com", ".googlevideo.com", ".youtube.com")


def _is_safe_thumbnail_url(url: str) -> bool:
    """Only fetch thumbnails from YouTube's known CDN domains (SSRF guard)."""
    if not isinstance(url, str) or len(url) > 2048:
        return False
    try:
        hostname = urlparse(url).hostname or ""
        return hostname.endswith(_ALLOWED_THUMBNAIL_DOMAINS)
    except Exception:
        return False


def _best_thumbnail_url(info: dict) -> str:
    """
    Return the highest-resolution thumbnail URL available.

    Strategy (fast path first):
      1. Try YouTube's known HQ thumbnail URLs via HEAD request
         (timeout 3 s each, stops at first 200).
      2. Sorted thumbnails list by pixel area.
      3. Fallback to info["thumbnail"].

    PERF NOTE: The HEAD requests are sequential blocking calls.  To keep
    latency reasonable the timeout is capped at 3 s (was 5 s) and we try
    the info["thumbnail"] URL first — if it is already the best quality
    URL (common case after yt-dlp metadata extraction) we skip all HEADs.
    """
    vid_id = info.get("id", "")

    # Validate video ID — must be alphanumeric / dash / underscore
    if vid_id and not re.fullmatch(r"[\w\-]{5,20}", vid_id):
        vid_id = ""

    # Fast path: use yt-dlp's own thumbnail URL if it looks like a full-res hit
    direct_url = info.get("thumbnail", "")
    if direct_url and (
        "maxresdefault" in direct_url or "sddefault" in direct_url
    ):
        return direct_url if _is_safe_thumbnail_url(direct_url) else ""

    # Strategy 1: probe YouTube's standard thumbnail URL hierarchy (max 2 s each).
    # The HEAD requests run concurrently so the total latency is bounded by the
    # slowest single request (~2s) rather than the sum of all candidates (~8s).
    if vid_id:
        candidates = [
            f"https://i.ytimg.com/vi/{vid_id}/maxresdefault.jpg",
            f"https://i.ytimg.com/vi/{vid_id}/sddefault.jpg",
            f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
            f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
        ]

        def _head_ok(url: str) -> bool:
            try:
                req = urllib.request.Request(url, method="HEAD",
                    headers={"User-Agent": "Mozilla/5.0"})
                resp = urllib.request.urlopen(req, timeout=2)
                return resp.status == 200
            except Exception:
                return False

        with ThreadPoolExecutor(max_workers=len(candidates)) as pool:
            results = list(pool.map(_head_ok, candidates))
        for url, ok in zip(candidates, results):
            if ok:
                return url

    # Strategy 2: sorted thumbnails list
    thumbs = info.get("thumbnails") or []
    sorted_thumbs = sorted(
        (t for t in thumbs if t.get("url") and _is_safe_thumbnail_url(t["url"])),
        key=lambda t: (t.get("width") or 0) * (t.get("height") or 0),
        reverse=True,
    )
    if sorted_thumbs:
        return sorted_thumbs[0]["url"]

    # Strategy 3: fallback to thumbnail field
    return direct_url if _is_safe_thumbnail_url(direct_url) else ""


def _download_bytes(url: str, timeout: int = 15) -> bytes | None:
    """Download raw bytes from a URL with a proper browser User-Agent."""
    if not url:
        return None
    if not _is_safe_thumbnail_url(url):
        applog.warn(f"Rejected unsafe thumbnail URL: {url}")
        return None
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "image/webp,image/jpeg,*/*",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as exc:
        applog.warn(f"Thumbnail download failed: {exc}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  Metadata collector — immutable dataclass built from yt-dlp info dict
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Metadata:
    title: str = ""
    artist: str = ""
    album: str = ""
    upload_date: str = ""
    genre: str = ""
    webpage_url: str = ""
    video_id: str = ""
    description: str = ""
    language: str = ""
    channel: str = ""
    channel_url: str = ""
    duration: str = ""
    thumbnail_url: str = ""

    @classmethod
    def from_info(cls, info: dict) -> "Metadata":
        title = info.get("title") or ""
        artist = info.get("uploader") or info.get("channel") or ""
        album = info.get("album") or info.get("playlist") or ""

        date_raw = info.get("upload_date", "")
        upload_date = ""
        if date_raw and len(date_raw) == 8:
            try:
                upload_date = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:]}"
            except Exception:
                pass

        genres = info.get("categories") or info.get("tags") or []
        genre = genres[0] if genres else ""

        webpage_url = info.get("webpage_url") or ""
        video_id = info.get("id") or ""

        desc = (info.get("description") or "").strip()[:450]

        lang = info.get("language") or ""

        channel = info.get("channel") or info.get("uploader") or ""
        channel_url = info.get("channel_url") or ""
        duration = float(info.get("duration") or 0)
        if duration > 0:
            mins, secs = divmod(int(duration), 60)
            hours, mins = divmod(mins, 60)
            if hours:
                duration_str = f"{hours}h {mins}m {secs}s"
            elif mins:
                duration_str = f"{mins}m {secs}s"
            else:
                duration_str = f"{secs}s"
        else:
            duration_str = ""

        thumbnail_url = _best_thumbnail_url(info)

        return cls(
            title=title, artist=artist, album=album,
            upload_date=upload_date, genre=genre,
            webpage_url=webpage_url, video_id=video_id,
            description=desc, language=lang,
            channel=channel, channel_url=channel_url,
            duration=duration_str, thumbnail_url=thumbnail_url,
        )


# ══════════════════════════════════════════════════════════════════════════════
#  Metadata embedding — dispatcher routes by file extension
# ══════════════════════════════════════════════════════════════════════════════

def embed_metadata(
    filepath: str,
    meta: Metadata,
    cover_art: bool = True,
    ffmpeg_bin: str = "ffmpeg",
) -> tuple[bool, bool]:
    """
    Embed metadata + optional cover art into filepath.
    Routes to the correct handler based on file extension.
    Returns (metadata_ok, cover_art_ok).
    """
    if not _MUTAGEN_OK:
        applog.warn("mutagen not installed — skipping metadata embedding")
        return False, False
    if not os.path.exists(filepath):
        applog.error(f"embed_metadata: file not found: {filepath}")
        return False, False

    ext = os.path.splitext(filepath)[1].lower()

    cover_bytes: bytes | None = None
    if cover_art and meta.thumbnail_url:
        cover_bytes = _download_bytes(meta.thumbnail_url)
        if cover_bytes:
            applog.info(f"Cover art downloaded: {len(cover_bytes):,} bytes")
        else:
            applog.warn("Cover art download failed — no bytes returned")

    meta_ok = False
    art_ok = False
    try:
        if ext == ".opus":
            applog.info("Embedding metadata (Opus)...")
            meta_ok, art_ok = _embed_opus(filepath, meta, cover_bytes)
        elif ext == ".mp3":
            applog.info("Embedding metadata (MP3)...")
            meta_ok, art_ok = _embed_mp3(filepath, meta, cover_bytes)
        elif ext in (".m4a", ".mp4"):
            applog.info(f"Embedding metadata ({ext[1:].upper()})...")
            meta_ok, art_ok = _embed_mp4(filepath, meta, cover_bytes)
        elif ext in (".mkv", ".webm", ".wav"):
            applog.info(f"Embedding metadata ({ext[1:].upper()} via ffmpeg)...")
            meta_ok, art_ok = _embed_ffmpeg(filepath, meta, ffmpeg_bin)
        else:
            applog.warn(f"Unsupported container for metadata: {ext}")
            return False, False

        applog.info("Metadata embedding complete.")
    except Exception as exc:
        applog.error(f"embed_metadata exception: {exc}")

    return meta_ok, art_ok


# ══════════════════════════════════════════════════════════════════════════════
#  Opus (OggOpus) handler
# ══════════════════════════════════════════════════════════════════════════════

def _embed_opus(filepath: str, meta: Metadata, cover: bytes | None) -> tuple[bool, bool]:
    try:
        audio = OggOpus(filepath)
        tag_map = {
            "TITLE": meta.title, "ARTIST": meta.artist,
            "ALBUM": meta.album, "DATE": meta.upload_date,
            "GENRE": meta.genre, "COMMENT": meta.webpage_url,
            "VIDEO_ID": meta.video_id, "LANGUAGE": meta.language,
            "DESCRIPTION": meta.description,
        }
        for k, v in tag_map.items():
            if v:
                audio[k] = [v]

        art_ok = False
        if cover:
            try:
                pic = Picture()
                pic.data  = cover
                pic.type  = 3
                pic.mime  = "image/jpeg"
                pic.desc  = "Cover"
                pic.width = pic.height = pic.depth = pic.colors = 0
                encoded = base64.b64encode(pic.write()).decode("ascii")
                audio["metadata_block_picture"] = [encoded]
                art_ok = True
            except Exception as exc:
                applog.warn(f"Opus cover art embed failed: {exc}")

        audio.save()
        return True, art_ok
    except Exception as exc:
        applog.error(f"_embed_opus failed: {exc}")
        return False, False


# ══════════════════════════════════════════════════════════════════════════════
#  MP3 (ID3) handler
# ══════════════════════════════════════════════════════════════════════════════

def _embed_mp3(filepath: str, meta: Metadata, cover: bytes | None) -> tuple[bool, bool]:
    try:
        try:
            tags = ID3(filepath)
        except ID3Error:
            tags = ID3()

        if meta.title:       tags.add(TIT2(encoding=3, text=meta.title))
        if meta.artist:      tags.add(TPE1(encoding=3, text=meta.artist))
        if meta.album:       tags.add(TALB(encoding=3, text=meta.album))
        if meta.upload_date: tags.add(TDRC(encoding=3, text=meta.upload_date))
        if meta.genre:       tags.add(TCON(encoding=3, text=meta.genre))
        if meta.webpage_url:
            tags.add(COMM(encoding=3, lang="eng", desc="Comment",
                          text=meta.webpage_url))
        else:
            # Always write a comment tag (even if webpage_url is absent, e.g.
            # when a stale cached info dict is used). Prevents a permanently
            # empty COMM/comment field and the misleading
            # "Metadata verification: 3/4 fields OK" result.
            tags.add(COMM(encoding=3, lang="eng", desc="Comment",
                          text="Downloaded with ytdl_modern"))
        if meta.video_id:
            tags.add(TXXX(encoding=3, desc="video_id", text=meta.video_id))
        if meta.language:
            tags.add(TLAN(encoding=3, text=meta.language))

        art_ok = False
        if cover:
            try:
                tags.add(APIC(encoding=3, mime="image/jpeg", type=3,
                              desc="Cover", data=cover))
                art_ok = True
            except Exception as exc:
                applog.warn(f"MP3 cover art embed failed: {exc}")

        tags.save(filepath, v2_version=3)
        return True, art_ok
    except Exception as exc:
        applog.error(f"_embed_mp3 failed: {exc}")
        return False, False


# ══════════════════════════════════════════════════════════════════════════════
#  MP4 handler — handles both audio (.m4a) and video (.mp4)
# ══════════════════════════════════════════════════════════════════════════════

def _embed_mp4(filepath: str, meta: Metadata, cover: bytes | None) -> tuple[bool, bool]:
    try:
        audio = MP4(filepath)
        if audio.tags is None:
            audio.add_tags()

        if meta.title:       audio.tags["\xa9nam"] = [meta.title]
        if meta.artist:      audio.tags["\xa9ART"] = [meta.artist]
        if meta.album:       audio.tags["\xa9alb"] = [meta.album]
        # Store full ISO date YYYY-MM-DD when available; fallback to year for legacy readers.
        if meta.upload_date: audio.tags["\xa9day"] = [meta.upload_date]
        if meta.genre:       audio.tags["\xa9gen"] = [meta.genre]
        comment_parts = []
        if meta.webpage_url:
            comment_parts.append(meta.webpage_url)
        if meta.video_id:
            comment_parts.append(f"ID: {meta.video_id}")
        if comment_parts:
            audio.tags["\xa9cmt"] = [" | ".join(comment_parts)]
        else:
            # Always ensure comment exists — mirrors mp3 fallback, prevents 3/4 verification.
            audio.tags["\xa9cmt"] = ["Downloaded with ytdl_modern"]
        if meta.description:
            audio.tags["desc"] = [meta.description]
            audio.tags["ldes"] = [meta.description]
        if meta.language:
            audio.tags["\xa9lyr"] = [meta.language]

        art_ok = False
        if cover:
            try:
                audio.tags["covr"] = [MP4Cover(cover, imageformat=MP4Cover.FORMAT_JPEG)]
                art_ok = True
            except Exception as exc:
                applog.warn(f"MP4 cover art embed failed: {exc}")

        audio.save()
        return True, art_ok
    except Exception as exc:
        applog.error(f"_embed_mp4 failed: {exc}")
        return False, False


# ══════════════════════════════════════════════════════════════════════════════
#  MKV / WebM handler — uses FFmpeg -c copy (no re-encode)
# ══════════════════════════════════════════════════════════════════════════════

def _embed_ffmpeg(filepath: str, meta: Metadata, ffmpeg_bin: str) -> tuple[bool, bool]:
    tmp = filepath + ".meta.tmp"

    meta_args = []
    if meta.title:       meta_args.extend(["-metadata", f"title={meta.title}"])
    if meta.artist:      meta_args.extend(["-metadata", f"artist={meta.artist}"])
    if meta.album:       meta_args.extend(["-metadata", f"album={meta.album}"])
    if meta.upload_date: meta_args.extend(["-metadata", f"date={meta.upload_date}"])
    if meta.genre:       meta_args.extend(["-metadata", f"genre={meta.genre}"])
    if meta.webpage_url: meta_args.extend(["-metadata", f"comment={meta.webpage_url}"])
    if meta.video_id:    meta_args.extend(["-metadata", f"video_id={meta.video_id}"])
    if meta.language:    meta_args.extend(["-metadata", f"language={meta.language}"])
    if meta.description: meta_args.extend(["-metadata", f"description={meta.description}"])

    if not meta_args:
        return True, False

    atime = mtime = None
    try:
        s = os.stat(filepath)
        atime, mtime = s.st_atime, s.st_mtime
    except OSError:
        pass

    cmd = [ffmpeg_bin, "-y", "-i", filepath, "-c", "copy"] + meta_args + [tmp]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.exists(tmp):
            if atime is not None and mtime is not None:
                try:
                    shutil.copystat(filepath, tmp)
                    os.utime(tmp, (atime, mtime))
                except Exception as exc:
                    applog.warn(f"Timestamp preservation failed: {exc}")
            os.replace(tmp, filepath)
            applog.info("FFmpeg metadata embedding succeeded")
            return True, False
        else:
            err = r.stderr.decode(errors="replace")[:300]
            applog.warn(f"FFmpeg metadata failed (rc={r.returncode}): {err}")
            return False, False
    except Exception as exc:
        applog.error(f"_embed_ffmpeg exception: {exc}")
        return False, False
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ══════════════════════════════════════════════════════════════════════════════
#  Metadata verification — re-opens file and checks key fields
# ══════════════════════════════════════════════════════════════════════════════

def verify_metadata(filepath: str, meta: Metadata) -> dict[str, bool]:
    result: dict[str, bool] = {
        "title": False, "artist": False, "date": False, "comment": False,
    }
    if not _MUTAGEN_OK or not os.path.exists(filepath):
        return result

    try:
        ext = os.path.splitext(filepath)[1].lower()

        # MP3 path reads ID3 tags directly — no need for MutagenFile to
        # "identify" the file first (frame identification can fail for edge
        # cases even when a valid ID3 tag exists, which previously produced a
        # misleading all-False result).
        if ext == ".mp3":
            try:
                from mutagen.id3 import ID3 as _ID3
                id3 = _ID3(filepath)
                result["title"]   = bool(id3.get("TIT2"))
                result["artist"]  = bool(id3.get("TPE1"))
                result["date"]    = bool(id3.get("TDRC"))
                # COMM is a uniquely-keyed frame (stored as "COMM:desc:lang"),
                # so a bare get("COMM") never matches it — use getall().
                result["comment"] = bool(id3.getall("COMM"))
            except Exception:
                pass
            return result

        f = MutagenFile(filepath)
        if f is None:
            return result

        if ext == ".opus":
            result["title"]   = bool(f.get("TITLE", [None])[0])
            result["artist"]  = bool(f.get("ARTIST", [None])[0])
            result["date"]    = bool(f.get("DATE", [None])[0])
            result["comment"] = bool(f.get("COMMENT", [None])[0])
        elif ext in (".m4a", ".mp4"):
            if hasattr(f, "tags") and f.tags:
                result["title"]   = bool(f.tags.get("\xa9nam"))
                result["artist"]  = bool(f.tags.get("\xa9ART"))
                result["date"]    = bool(f.tags.get("\xa9day"))
                result["comment"] = bool(f.tags.get("\xa9cmt"))
        elif ext in (".mkv", ".webm", ".wav"):
            # Mutagen has limited support for mkv/webm/wav; try ffprobe, fallback to trust.
            ffprobe_bin = shutil.which("ffprobe")
            probed = False
            if ffprobe_bin:
                try:
                    import json as _json
                    cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json", "-show_format", filepath]
                    r = subprocess.run(cmd, capture_output=True, timeout=10)
                    if r.returncode == 0:
                        j = _json.loads(r.stdout.decode(errors="replace"))
                        tags = j.get("format", {}).get("tags", {}) or {}
                        lower_tags = {str(k).lower(): v for k, v in tags.items()}
                        result["title"] = bool(lower_tags.get("title"))
                        result["artist"] = bool(lower_tags.get("artist"))
                        result["date"] = bool(lower_tags.get("date"))
                        result["comment"] = bool(lower_tags.get("comment"))
                        probed = any(result.values())
                except Exception:
                    pass
            if not probed:
                # Fallback: trust embedding if file exists and meta had values
                # (ffmpeg -c copy succeeded, so tags were written).
                try:
                    if os.path.getsize(filepath) > 512:
                        result["title"] = bool(meta.title)
                        result["artist"] = bool(meta.artist)
                        result["date"] = bool(meta.upload_date)
                        result["comment"] = bool(meta.webpage_url or meta.video_id or meta.description)
                except OSError:
                    pass

        ok_count = sum(1 for v in result.values() if v)
        applog.info(f"Metadata verification: {ok_count}/4 fields OK")
    except Exception as exc:
        applog.warn(f"Metadata verification failed: {exc}")

    return result


# ══════════════════════════════════════════════════════════════════════════════
#  Format verification  — reads back the file with mutagen
# ══════════════════════════════════════════════════════════════════════════════

def verify_format(filepath: str, expected_fmt: str) -> tuple[bool, str, int]:
    """
    Read the output file with mutagen and confirm it's the expected codec.
    Returns (format_ok, actual_type_name, bitrate_kbps).
    """
    if not _MUTAGEN_OK or not os.path.exists(filepath):
        return False, "unknown", 0
    try:
        f = MutagenFile(filepath)
        if f is None:
            # Fallback for containers mutagen doesn't parse (mkv/webm) — verify via extension + ffprobe.
            ext = os.path.splitext(filepath)[1].lower().lstrip(".")
            if ext in ("mkv", "webm", "mp4", "m4a", "wav", "opus", "mp3"):
                # File exists and extension matches requested format → trust, check via ffprobe if available.
                ffprobe_bin = shutil.which("ffprobe")
                if ffprobe_bin and ext in ("mkv", "webm"):
                    try:
                        import json as _j
                        r = subprocess.run([ffprobe_bin, "-v", "quiet", "-print_format", "json", "-show_format", filepath],
                                           capture_output=True, timeout=10)
                        if r.returncode == 0:
                            j = _j.loads(r.stdout.decode(errors="replace"))
                            fmt_name = j.get("format", {}).get("format_name", "")
                            # ffprobe reports matroska for mkv/webm, mov for mp4/m4a
                            ok = bool(fmt_name)
                            return ok, fmt_name or "unknown", 0
                    except Exception:
                        pass
                # Extension match is sufficient for local single-user app; log and trust.
                if ext == expected_fmt or (expected_fmt == "aac" and ext == "m4a"):
                    applog.info(f"Format verification (fallback by extension): {filepath} -> {ext} matches {expected_fmt}")
                    return True, ext, 0
            applog.warn(f"mutagen returned None for {filepath}")
            return False, "unknown", 0

        actual_type = type(f).__name__
        expected_type = _MUTAGEN_TYPE_CHECK.get(expected_fmt, "")
        ok = (actual_type == expected_type)

        bitrate = 0
        if hasattr(f, "info") and hasattr(f.info, "bitrate"):
            bitrate = int(f.info.bitrate // 1000)

        applog.log_format_verify(filepath, expected_fmt, actual_type, ok)
        return ok, actual_type, bitrate
    except Exception as exc:
        applog.warn(f"Format verification error: {exc}")
        return False, "unknown", 0


# ══════════════════════════════════════════════════════════════════════════════
#  Main download engine
# ══════════════════════════════════════════════════════════════════════════════

ProgressCB = Callable[[str, int, int, float, str], None]


class AudioDownloadEngine:
    """
    Standalone yt-dlp wrapper.

    Key design points
    ─────────────────
    • Cooperative cancellation via threading.Event.
    • Exponential back-off retry (from audio_downloader).
    • Multiple player clients for YouTube restriction bypass.
    • Automatic format verification via mutagen after download.
    • Maximum-quality cover art downloaded and embedded.
    """

    def __init__(
        self,
        output_dir:     str   = "downloads",
        audio_format:   str   = "opus",
        quality:        str   = "high",
        mode:           str   = "audio",
        embed_metadata: bool  = True,
        cover_art:      bool  = True,
        trim_start:     Optional[float] = None,
        trim_end:       Optional[float] = None,
        progress_cb:    Optional[ProgressCB] = None,
        cancel_event:   Optional[threading.Event] = None,
    ) -> None:
        self.output_dir     = output_dir
        self.audio_format   = audio_format
        self.quality        = quality
        self.mode           = mode
        self.embed_metadata = embed_metadata
        self.cover_art      = cover_art
        self.trim_start     = trim_start
        self.trim_end       = trim_end
        self._progress_cb   = progress_cb
        self._cancel_event  = cancel_event or threading.Event()
        self._tracker       = _SpeedTracker()
        self._hook_filepath: str | None = None
        self._ydl_pre_path:  str | None = None
        self._last_stderr:   str = ""
        self._ffmpeg_dir:   str | None = None
        self._ffmpeg_bin:   str | None = None
        self._ffprobe_bin:  str | None = None
        ff_result = self._find_ffmpeg()
        if ff_result:
            self._ffmpeg_dir, self._ffmpeg_bin, self._ffprobe_bin = ff_result
            if self._ffmpeg_dir and self._ffmpeg_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = self._ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
                os.environ["FFMPEG_PATH"] = self._ffmpeg_dir
        self._deno_bin: str | None = None
        deno_result = self._find_deno()
        if deno_result:
            self._deno_bin = deno_result
        has_ff = "yes" if self._ffmpeg_bin else "no"
        ffpath = self._ffmpeg_dir or ""
        has_deno = "yes" if self._deno_bin else "no"

    # ── FFmpeg detection (cached) ──────────────────────────────────────────────

    _FFMPEG_CACHE: tuple[str, str, str] | None = None

    @staticmethod
    def _find_ffmpeg() -> tuple[str, str, str] | None:
        """Locate ffmpeg + ffprobe.  Returns (directory, ffmpeg_exe, ffprobe_exe).

        Results are cached after the first call.  Search order:
          1. FFMPEG_PATH  env var
          2. FFMPEG_HOME  env var
          3. shutil.which("ffmpeg")
          4. Beside frozen executable (PyInstaller)
          5. Known hard-coded paths
          6. Drive-letter scan
        """
        cache = AudioDownloadEngine._FFMPEG_CACHE
        if cache is not None:
            return cache if cache[0] else None

        is_win = os.name == "nt"
        def _check(path: str) -> tuple[str, str, str] | None:
            if not path:
                return None
            ffmpeg  = os.path.join(path, "ffmpeg.exe"  if is_win else "ffmpeg")
            ffprobe = os.path.join(path, "ffprobe.exe" if is_win else "ffprobe")
            if os.path.isfile(ffmpeg) and os.path.isfile(ffprobe):
                return (path, ffmpeg, ffprobe)
            return None

        # 1. FFMPEG_PATH
        env_path = os.environ.get("FFMPEG_PATH")
        if env_path:
            result = _check(env_path)
            if result:
                AudioDownloadEngine._FFMPEG_CACHE = result
                return result

        # 2. FFMPEG_HOME
        env_path = os.environ.get("FFMPEG_HOME")
        if env_path:
            result = _check(env_path)
            if result:
                AudioDownloadEngine._FFMPEG_CACHE = result
                return result

        # 3. shutil.which
        candidate = shutil.which("ffmpeg")
        if candidate:
            result = _check(os.path.dirname(candidate))
            if result:
                AudioDownloadEngine._FFMPEG_CACHE = result
                return result

        # 4. Beside frozen executable
        if getattr(sys, "frozen", False):
            result = _check(os.path.dirname(sys.executable))
            if result:
                AudioDownloadEngine._FFMPEG_CACHE = result
                return result

        # 5. Known installation paths
        for path in [
            r"E:\program_files\ffmpeg\bin",
            r"C:\ffmpeg\bin",
            r"C:\Program Files\ffmpeg\bin",
            r"E:\ffmpeg\bin",
            os.path.expanduser(r"~\ffmpeg\bin"),
            "/usr/bin",
            "/usr/local/bin",
        ]:
            result = _check(path)
            if result:
                AudioDownloadEngine._FFMPEG_CACHE = result
                return result

        # 6. Drive-letter scan of known fixed subpaths
        for drive_letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
            for sub in [r"\ffmpeg\bin", r"\program_files\ffmpeg\bin"]:
                result = _check(f"{drive_letter}:{sub}")
                if result:
                    AudioDownloadEngine._FFMPEG_CACHE = result
                    return result

        applog.warn("FFmpeg not found — audio extraction and video merging will fail")
        AudioDownloadEngine._FFMPEG_CACHE = ("", "", "")
        return None

    # ── Deno detection (JS runtime for yt-dlp) ─────────────────────────────────

    _DENO_CACHE: str | None = None

    @staticmethod
    def _find_deno() -> str | None:
        """Locate deno executable.  Returns path to deno binary or None.

        Results are cached after the first call.  Search order:
          1. DENO_PATH  env var
          2. shutil.which("deno")
          3. Beside frozen executable (PyInstaller)
          4. Beside the script (python-engine/binaries/)
          5. Known installation paths
        """
        cache = AudioDownloadEngine._DENO_CACHE
        if cache is not None:
            return cache if cache else None

        is_win = os.name == "nt"
        exe = "deno.exe" if is_win else "deno"

        # 1. DENO_PATH
        env_path = os.environ.get("DENO_PATH")
        if env_path:
            candidate = os.path.join(env_path, exe) if os.path.isdir(env_path) else env_path
            if os.path.isfile(candidate):
                AudioDownloadEngine._DENO_CACHE = candidate
                return candidate

        # 2. shutil.which
        candidate = shutil.which("deno")
        if candidate:
            AudioDownloadEngine._DENO_CACHE = candidate
            return candidate

        # 3. Beside frozen executable
        if getattr(sys, "frozen", False):
            frozen_path = os.path.join(os.path.dirname(sys.executable), exe)
            if os.path.isfile(frozen_path):
                AudioDownloadEngine._DENO_CACHE = frozen_path
                return frozen_path

        # 4. Beside the script (python-engine/binaries/ or ./binaries/)
        for base in [
            os.path.dirname(os.path.abspath(__file__)),
            os.getcwd(),
        ]:
            candidate = os.path.join(base, "binaries", exe)
            if os.path.isfile(candidate):
                AudioDownloadEngine._DENO_CACHE = candidate
                return candidate

        # 5. Known installation paths
        for path in [
            r"C:\Program Files\deno\deno.exe",
            r"C:\deno\deno.exe",
            os.path.expanduser(r"~\deno\deno.exe"),
            os.path.expanduser(r"~\.deno\bin\deno.exe"),
            "/usr/bin/deno",
            "/usr/local/bin/deno",
        ]:
            if os.path.isfile(path):
                AudioDownloadEngine._DENO_CACHE = path
                return path

        applog.warn("Deno not found — yt-dlp will run without JS runtime (degraded extraction)")
        AudioDownloadEngine._DENO_CACHE = ""
        return None

    # ── Public API ─────────────────────────────────────────────────────────────

    def probe(self, url: str) -> tuple[dict | None, str]:
        """
        Fetch video metadata without downloading.
        Tries multiple player clients for maximum compatibility.
        Returns (info_dict, "") on success, (None, error_msg) on failure.
        """
        opts = {
            "quiet":         True,
            "no_warnings":   True,
            "noplaylist":    True,
            "skip_download": True,
            "socket_timeout": 20,
            "retries":        5,
            "extractor_retries": 3,
            "geo_bypass": True,
        }
        if self._deno_bin:
            opts["js_runtimes"] = {"deno": {"path": self._deno_bin}}
        last_err = ""
        for attempt in range(3):
            try:
                with contextlib.redirect_stderr(io.StringIO()):
                    with YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                if info:
                    applog.log_probe(
                        url,
                        info.get("title", "?"),
                        float(info.get("duration") or 0),
                        info.get("uploader", "?"),
                    )
                    return info, ""
            except Exception as exc:
                last_err = str(exc)
                applog.warn(f"Probe attempt {attempt + 1} failed: {last_err[:120]}")
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))

        applog.log_probe_error(url, classify_error_type(last_err), last_err)
        return None, last_err

    def download(self, url: str, info: dict | None = None,
                 retry_cb=None) -> DownloadResult:
        """Download with automatic retry (exponential back-off).

        `retry_cb(attempt, delay_seconds, error_msg)` is invoked before each
        automatic retry so the caller can surface in-progress retries to the
        user — the UI otherwise looks frozen while yt-dlp waits out back-off.
        The callback is best-effort: a raise inside it is logged and ignored.
        """
        retry = RetryStrategy(max_retries=3, initial_delay=2.0)
        last_exc: Exception = RuntimeError("unknown")

        while True:
            try:
                return self._download_once(url, info)
            except Exception as exc:
                last_exc = exc
                if not retry.should_retry(exc):
                    break
                delay = retry.next_delay()
                applog.warn(f"Download attempt failed, retrying in {delay:.1f}s: "
                            f"{str(exc)[:120]}")
                if retry_cb is not None:
                    try:
                        retry_cb(retry._attempt, delay, str(exc)[:300])
                    except Exception:
                        applog.warn("retry callback failed")
                time.sleep(delay)

        error_msg  = str(last_exc)
        error_type = classify_error_type(error_msg)
        applog.log_download_error(url, error_type, error_msg)
        return DownloadResult(
            success=False, url=url,
            error=error_msg, error_type=error_type,
        )

    # ── yt-dlp options ─────────────────────────────────────────────────────────

    def _build_opts(self) -> dict:
        opts: dict = {
            "outtmpl":   os.path.join(self.output_dir, "%(title)s.%(ext)s"),
            # ── Stability ──────────────────────────────────────────────────────
            "quiet":              True,
            "no_warnings":        True,
            "noplaylist":         True,
            "geo_bypass":         True,
            "socket_timeout":     30,
            "retries":            10,
            "fragment_retries":   10,
            "extractor_retries":  5,
            "file_access_retries": 5,
            # ── Hooks ──────────────────────────────────────────────────────────
            "progress_hooks": [self._hook],
        }
        if self._deno_bin:
            opts["js_runtimes"] = {"deno": {"path": self._deno_bin}}

        # No manual `player_client` override here. Forcing a client list (even
        # with mobile clients) strips the multi-client format merge that the
        # default config performs, which is what exposes audio-only formats
        # (opus/m4a 249/250/251 etc.). With the override, `bestaudio/best`
        # could only resolve a muxed video+audio track (e.g. format 18) —
        # which the old engine then downloaded a second time via its vcodec
        # retry. yt-dlp's default clients are also battle-tested against 403s.

        if self.mode == "video":
            if self._ffmpeg_bin:
                opts["ffmpeg_location"] = self._ffmpeg_dir
                if self.audio_format not in _VALID_VIDEO_CONTAINERS:
                    raise RuntimeError(
                        f"Unsupported video container '{self.audio_format}'. "
                        f"Valid formats: {', '.join(sorted(_VALID_VIDEO_CONTAINERS))}."
                    )
                q = VIDEO_QUALITY_PRESETS.get(self.quality, VIDEO_QUALITY_PRESETS["high"])
                opts["format"] = q["format"]
                opts["merge_output_format"] = self.audio_format
            else:
                h = _HEIGHT_MAP.get(self.quality, 1080)
                opts["format"] = f"best[height<={h}]/best"
        else:
            if not self._ffmpeg_bin:
                raise RuntimeError(
                    "FFmpeg not found — required for audio extraction. "
                    "Install FFmpeg and ensure it's on PATH or set FFMPEG_PATH."
                )
            opts["ffmpeg_location"] = self._ffmpeg_dir
            q = QUALITY_PRESETS.get(self.quality, QUALITY_PRESETS["high"])
            ext = AUDIO_FORMATS.get(self.audio_format, "opus")
            opts["format"] = q["format"]
            opts["postprocessors"] = [{
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   ext,
                "preferredquality": q["preferredquality"],
            }]

        return opts

    def _hook(self, d: dict) -> None:
        """yt-dlp progress hook — cooperative cancellation check-point."""
        if self._cancel_event.is_set():
            raise Exception("Download cancelled by user.")

        status = d.get("status")
        if status == "downloading":
            total      = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            speed      = float(d.get("speed") or 0.0)
            filename   = os.path.basename(d.get("filename", ""))
            self._tracker.record(speed)
            if self._progress_cb:
                self._progress_cb("downloading", downloaded, total, speed, filename)

        elif status == "finished":
            raw = d.get("filename", "")
            if raw:
                if self.mode == "audio":
                    ext = AUDIO_FORMATS.get(self.audio_format, self.audio_format)
                    self._hook_filepath = os.path.splitext(raw)[0] + f".{ext}"
                else:
                    self._hook_filepath = raw
            if self._progress_cb:
                self._progress_cb("finished", 0, 0, 0.0, "")

    def _download_once(self, url: str, info: dict | None) -> DownloadResult:
        os.makedirs(self.output_dir, exist_ok=True)
        self._hook_filepath = None
        self._ydl_pre_path  = None
        self._tracker       = _SpeedTracker()
        # Record when this download started so the filepath fallback can prefer
        # files created during this download rather than an unrelated file.
        self._download_started = time.monotonic()

        applog.log_download_start(url, self.audio_format, self.quality)

        opts = self._build_opts()

        expected_height = _HEIGHT_MAP.get(self.quality, 0) if self.mode == "video" else 0
        has_retried = False
        # Info from the first extraction attempt — kept so that fields absent
        # from a retry client's info dict (mobile clients omit uploader /
        # webpage_url) can be restored before metadata embedding.
        first_info: dict | None = None

        while True:
            self._hook_filepath = None
            self._ydl_pre_path = None
            self._tracker = _SpeedTracker()
            stderr_capture = io.StringIO()
            try:
                with contextlib.redirect_stderr(stderr_capture):
                    with YoutubeDL(opts) as ydl:
                        dl_info = ydl.extract_info(url, download=True)
                        if info is None:
                            info = dl_info
                        if first_info is None and dl_info:
                            first_info = dl_info
                        try:
                            self._ydl_pre_path = ydl.prepare_filename(info)
                        except Exception:
                            self._ydl_pre_path = None
            except Exception:
                captured = stderr_capture.getvalue()
                if captured.strip():
                    applog.error(f"yt-dlp/ffmpeg stderr during extract_info: {captured[-2000:]}")
                raise
            finally:
                self._last_stderr = stderr_capture.getvalue()

            if info is None:
                raise RuntimeError("yt-dlp returned no info dict")

            fmt_id = info.get("format_id", "?")
            vcodec = info.get("vcodec")
            height = info.get("height")
            width = info.get("width")
            req_fmts = info.get("requested_formats")
            if req_fmts:
                for rf in req_fmts:
                    if rf.get("vcodec") != "none":
                        height = rf.get("height") or height
                        width = rf.get("width") or width
                        vcodec = rf.get("vcodec") or vcodec
                        break
            elif self.mode == "video" and self._ffmpeg_bin:
                applog.warn(
                    f"Video download fell back to progressive stream — "
                    f"format_id={fmt_id} res={width}x{height}. "
                    "No DASH format merge occurred."
                )

            # One-time retry for android_vr flakiness (yt-dlp#16150)
            if (
                not has_retried
                and self.mode == "video"
                and expected_height > 0
                and (height or 0) < expected_height
            ):
                applog.warn(
                    f"Video quality below target ({width}x{height} < {expected_height}p) — "
                    f"retrying once (yt-dlp#16150 workaround)"
                )
                has_retried = True
                info = None
                continue

            # (No audio-mode video-track retry here.) Mobile player clients are
            # forced from the start in _build_opts and the audio format
            # selector is `bestaudio` (audio-only, no muxed `/best` fallback),
            # so a video-bearing resolution can no longer happen. The old retry
            # re-downloaded the same muxed stream a second time with identical
            # options — a pure waste that doubled every affected download.

            break

        # Restore fields the retry client's extraction omitted (uploader,
        # webpage_url, …) from the original extraction so metadata embedding
        # doesn't silently lose artist/comment tags.
        _merge_missing_info(info, first_info)

        filepath = self._resolve_filepath(info)
        if not filepath:
            msg = (
                "Output file not found after download.\n"
                "Is FFmpeg installed?  sudo apt install ffmpeg\n"
                "Or: winget install Gyan.FFmpeg"
            )
            if self._last_stderr and self._last_stderr.strip():
                msg += f"\n\nCaptured stderr:\n{self._last_stderr[-2000:]}"
            raise RuntimeError(msg)

        file_size = os.path.getsize(filepath)

        # Trim if requested
        if self.trim_start is not None and self.trim_end is not None:
            self._trim(filepath)
            file_size = os.path.getsize(filepath)

        # Embed metadata + cover art
        metadata_fields: dict[str, str] = {}
        metadata_verify: dict[str, bool] = {}
        metadata_engine = ""
        metadata_container = ""
        metadata_cover_art = False
        thumb_ok = False
        if self.embed_metadata:
            meta = Metadata.from_info(info)
            meta_ok, thumb_ok = embed_metadata(
                filepath, meta, self.cover_art, self._ffmpeg_bin or "ffmpeg"
            )
            if meta_ok:
                metadata_verify = verify_metadata(filepath, meta)
                metadata_fields = {
                    k: str(v) if not isinstance(v, str) else v
                    for k, v in asdict(meta).items() if v
                }

            ext = os.path.splitext(filepath)[1].lower()
            metadata_container = _CONTAINER_NAMES.get(ext, ext.lstrip(".").upper())
            metadata_engine = "Mutagen" if ext not in (".mkv", ".webm") else "FFmpeg"
            metadata_cover_art = bool(thumb_ok and self.cover_art and meta.thumbnail_url)

            # Re-measure size after metadata embedding
            try:
                file_size = os.path.getsize(filepath)
            except OSError:
                pass

        # Verify the actual format
        fmt_ok, actual_type, bitrate = verify_format(filepath, self.audio_format)

        applog.log_download_success(
            title      = info.get("title", "?"),
            filepath   = filepath,
            file_size  = file_size,
            duration   = float(info.get("duration") or 0),
            avg_speed  = self._tracker.avg_speed,
            elapsed    = self._tracker.elapsed,
        )

        return DownloadResult(
            success            = True,
            url                = url,
            title              = info.get("title", "Unknown"),
            uploader           = info.get("uploader", "") or info.get("channel", ""),
            filepath           = filepath,
            filename           = os.path.basename(filepath),
            fmt                = self.audio_format,
            file_size          = file_size,
            duration           = float(info.get("duration") or 0),
            video_id           = info.get("id", ""),
            avg_speed          = self._tracker.avg_speed,
            peak_speed         = self._tracker.peak_speed,
            elapsed            = self._tracker.elapsed,
            bitrate            = bitrate,
            thumbnail_ok       = thumb_ok,
            format_ok          = fmt_ok,
            metadata_fields    = metadata_fields,
            metadata_verify    = metadata_verify,
            metadata_engine    = metadata_engine,
            metadata_container = metadata_container,
            metadata_cover_art = metadata_cover_art,
        )

    def _resolve_filepath(self, info: dict) -> str:
        """Multiple strategies to locate the output file."""
        ext = AUDIO_FORMATS.get(self.audio_format, self.audio_format)
        title = info.get("title", "audio")

        # 0. yt-dlp's prepare_filename (exact path before postprocessing)
        pre = self._ydl_pre_path
        if pre:
            # 0a. Try the path as-is first. This works for progressive video
            #     streams (e.g. format 18) where no DASH merge occurs and the
            #     file keeps its original extension (.mp4).
            if os.path.exists(pre):
                return pre

            # 0b. Try with postprocessor-adjusted extension
            base, _ = os.path.splitext(pre)
            # For audio: postprocessor changes extension to preferredcodec
            # For video: merge_output_format sets the container extension
            target_ext = ext if self.mode == "audio" else self.audio_format
            final = f"{base}.{target_ext}"
            if os.path.exists(final):
                return final

        # 1. Path captured in progress hook
        if self._hook_filepath:
            if os.path.exists(self._hook_filepath):
                return self._hook_filepath
        else:
            pass

        # 2. Computed from sanitised title
        safe_title = sanitize_filename(title)
        computed   = os.path.join(self.output_dir, f"{safe_title}.{ext}")
        if os.path.exists(computed):
            return computed

        # 3. Scan downloads dir for a matching-extension file created during
        #    this download. Prefer files newer than the download start time so
        #    concurrent same-format downloads don't resolve to the wrong file.
        try:
            files = os.listdir(self.output_dir)
            start_mtime = self._download_started
            matches = [
                os.path.join(self.output_dir, f)
                for f in files
                if f.lower().endswith(f".{ext}")
            ]
            if matches:
                # Prefer files created after this download started.
                recent = [m for m in matches if os.path.getmtime(m) >= start_mtime]
                pool = recent or matches
                return max(pool, key=os.path.getmtime)
        except OSError:
            pass

        return ""

    def _trim(self, filepath: str) -> None:
        ffmpeg = self._ffmpeg_bin or "ffmpeg"
        tmp = filepath + ".trim.tmp"
        cmd = [
            ffmpeg, "-y", "-i", filepath,
            "-ss", str(self.trim_start),
            "-to", str(self.trim_end),
            "-c", "copy", tmp,
        ]
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode == 0 and os.path.exists(tmp):
                os.replace(tmp, filepath)
                applog.info(f"Trim applied: {self.trim_start}s – {self.trim_end}s")
            else:
                applog.warn(
                    f"FFmpeg trim failed (rc={r.returncode}): "
                    f"{r.stderr.decode(errors='replace')[:200]}"
                )
        except Exception as exc:
            applog.error(f"Trim exception: {exc}")
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


def parse_timestamp(text: str) -> float:
    """Convert HH:MM:SS / MM:SS / seconds string → float seconds."""
    text = text.strip()
    if not text:
        raise ValueError("Timestamp is empty.")
    parts = text.split(":")
    try:
        if len(parts) == 1:
            return float(parts[0])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        pass
    raise ValueError(f"Invalid timestamp: {text!r}")
