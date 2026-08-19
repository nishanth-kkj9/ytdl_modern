#!/usr/bin/env python3
"""IPC wrapper for the ytdl engine.

Reads newline-delimited JSON from stdin and writes newline-delimited JSON to stdout.
Supported commands:
  - probe
  - download
  - cancel

Each download runs in its own thread, and all stdout writes are flushed immediately.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import threading
import traceback
from typing import Any

from engine import AudioDownloadEngine, DownloadResult, classify_error_type

_YDL_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# Ensure only JSON goes to stdout — redirect all other output to stderr.
_ORIGINAL_STDOUT = sys.stdout
sys.stdout = sys.stderr


def _emit_ready() -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    deno = shutil.which("deno")
    _write_message({
        "type": "engine_ready",
        "ffmpeg": bool(ffmpeg),
        "ffprobe": bool(ffprobe),
        "deno": bool(deno),
    })

_DOWNLOAD_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _write_message(message: dict[str, Any]) -> None:
    try:
        _ORIGINAL_STDOUT.write(json.dumps(message, default=str) + "\n")
        _ORIGINAL_STDOUT.flush()
    except Exception:
        # If stdout is broken, abort.
        raise


def _write_error(id_: str | None, error_type: str, error: str) -> None:
    _write_message({
        "type": "error",
        "id": id_ or "",
        "error_type": error_type,
        "error": error,
    })


def _write_progress(id_: str, status: str, downloaded: int, total: int, speed: float, filename: str) -> None:
    _write_message({
        "type": "progress",
        "id": id_,
        "status": status,
        "downloaded": downloaded,
        "total": total,
        "speed": speed,
        "filename": filename,
    })


def _write_result(id_: str, result: DownloadResult) -> None:
    payload = {
        "type": "result",
        "id": id_,
        "success": result.success,
        "url": result.url,
        "title": result.title,
        "uploader": result.uploader,
        "filepath": result.filepath,
        "filename": result.filename,
        "fmt": result.fmt,
        "file_size": result.file_size,
        "duration": result.duration,
        "video_id": result.video_id,
        "avg_speed": result.avg_speed,
        "peak_speed": result.peak_speed,
        "elapsed": result.elapsed,
        "bitrate": result.bitrate,
        "thumbnail_ok": result.thumbnail_ok,
        "format_ok": result.format_ok,
        "error": result.error,
        "error_type": result.error_type,
        "metadata_fields": result.metadata_fields,
        "metadata_verify": result.metadata_verify,
        "metadata_engine": result.metadata_engine,
        "metadata_container": result.metadata_container,
        "metadata_cover_art": result.metadata_cover_art,
    }
    _write_message(payload)


def _probe(url: str, id_: str) -> None:
    try:
        engine = AudioDownloadEngine()
        info, error = engine.probe(url)
        if info is not None:
            _write_message({
                "type": "probe_result",
                "id": id_,
                "success": True,
                "info": info,
            })
        else:
            if not error:
                error = "Probe returned no info; verify network, yt-dlp, and URL compatibility."
            error_type = classify_error_type(error)
            _write_error(id_, error_type, error)
    except Exception as exc:
        _write_error(id_, "ProbeError", f"{type(exc).__name__}: {exc}")


def _run_download(id_: str, url: str, audio_format: str, quality: str, output_dir: str, mode: str) -> None:
    cancel_event = threading.Event()
    with _LOCK:
        _DOWNLOAD_JOBS[id_] = {
            "cancel_event": cancel_event,
        }

    def progress_cb(status: str, downloaded: int, total: int, speed: float, filename: str) -> None:
        _write_progress(id_, status, downloaded, total, speed, filename)

    try:
        engine = AudioDownloadEngine(
            output_dir=output_dir,
            audio_format=audio_format,
            quality=quality,
            mode=mode,
            progress_cb=progress_cb,
            cancel_event=cancel_event,
            embed_metadata=True,
            cover_art=True,
        )
        result = engine.download(url)

        if result.success:
            _write_result(id_, result)
        else:
            _write_error(id_, result.error_type or "DownloadError", result.error or "Download failed")
    except Exception as exc:
        _write_error(id_, "DownloadError", str(exc) or "Download exception")
    finally:
        with _LOCK:
            _DOWNLOAD_JOBS.pop(id_, None)


def _start_download(command: dict[str, Any]) -> None:
    id_ = str(command.get("id", "")).strip()
    url = str(command.get("url", "")).strip()
    audio_format = str(command.get("format", "opus")).strip() or "opus"
    quality = str(command.get("quality", "high")).strip() or "high"
    output_dir = str(command.get("output_dir", "downloads")).strip() or "downloads"
    mode = str(command.get("mode", "audio")).strip() or "audio"

    if not id_ or not url:
        _write_error(id_, "InvalidCommand", "download command requires 'id' and 'url'")
        return

    with _LOCK:
        if id_ in _DOWNLOAD_JOBS:
            _write_error(id_, "DuplicateId", f"Download id '{id_}' is already active")
            return

    os.makedirs(output_dir, exist_ok=True)
    thread = threading.Thread(
        target=_run_download,
        args=(id_, url, audio_format, quality, output_dir, mode),
        daemon=True,
    )
    thread.start()
    _write_message({
        "type": "download_started",
        "id": id_,
        "url": url,
        "fmt": audio_format,
        "quality": quality,
    })


def _cancel(command: dict[str, Any]) -> None:
    id_ = str(command.get("id", "")).strip()
    if not id_:
        _write_error(id_, "InvalidCommand", "cancel command requires 'id'")
        return

    with _LOCK:
        job = _DOWNLOAD_JOBS.get(id_)
        if not job:
            _write_error(id_, "NotFound", f"No active download with id '{id_}'")
            return
        cancel_event: threading.Event = job["cancel_event"]
        cancel_event.set()

    _write_message({
        "type": "cancelled",
        "id": id_,
    })


def _handle_command(command: dict[str, Any]) -> None:
    cmd = str(command.get("cmd", "")).strip().lower()
    if cmd == "download":
        _start_download(command)
    elif cmd == "probe":
        id_ = str(command.get("id", "")).strip() or ""
        url = str(command.get("url", "")).strip()
        if not id_ or not url:
            _write_error(id_, "InvalidCommand", "probe command requires 'id' and 'url'")
            return
        thread = threading.Thread(target=_probe, args=(url, id_), daemon=True)
        thread.start()
    elif cmd == "cancel":
        _cancel(command)
    else:
        _write_error(str(command.get("id", "")), "UnknownCommand", f"Unsupported cmd: {cmd}")


def main() -> None:
    _emit_ready()
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue

        try:
            command = json.loads(line)
        except json.JSONDecodeError as exc:
            _write_error(None, "JSONDecodeError", f"Invalid JSON: {exc}")
            continue

        if not isinstance(command, dict):
            _write_error(None, "InvalidCommand", "Top-level JSON value must be an object")
            continue

        _handle_command(command)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        _write_error(None, "FatalError", traceback.format_exc())
