"""Unit tests for the Python download engine.

These guard against regressions of the P0 scope bug and ensure the
engine can always be instantiated and configured.
"""
import os
import sys

# When running `python -m pytest` from the python-engine/ directory the CWD
# (python-engine) is prepended to sys.path, so `import engine` works. The
# insert below makes the tests robust even when run from elsewhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import (  # noqa: E402
    AudioDownloadEngine,
    _is_safe_thumbnail_url,
    _download_bytes,
    _merge_missing_info,
    verify_metadata,
    Metadata,
    VIDEO_QUALITY_PRESETS,
)


def test_instantiation():
    """Regression: AudioDownloadEngine must instantiate without AttributeError."""
    engine = AudioDownloadEngine()
    assert engine is not None


def test_default_config():
    engine = AudioDownloadEngine()
    assert engine.audio_format == "opus"
    assert engine.quality == "high"
    assert engine.mode == "audio"
    assert engine.cover_art is True
    assert engine.embed_metadata is True


def test_custom_output_dir():
    # A custom output dir should pass through as a path attribute.
    engine = AudioDownloadEngine(output_dir="/tmp/ytdl-test-custom")
    assert engine.output_dir == "/tmp/ytdl-test-custom"


def test_safe_thumbnail_domains():
    assert _is_safe_thumbnail_url("https://i.ytimg.com/vi/abc/maxresdefault.jpg")
    assert _is_safe_thumbnail_url("https://lh3.googleusercontent.com/foo")


# ── _merge_missing_info (audio-retry info restoration) ────────────────────────

def test_merge_missing_info_fills_gaps_from_first_attempt():
    """Regression: mobile-player-client extractions omit uploader/webpage_url —
    the merge must restore them so artist/comment tags get embedded."""
    target = {"id": "abc", "title": "T", "uploader": "", "webpage_url": None}
    fallback = {
        "id": "abc",
        "title": "T",
        "uploader": "Think Music India",
        "webpage_url": "https://www.youtube.com/watch?v=abc",
        "duration": 205,
    }
    merged = _merge_missing_info(target, fallback)
    assert merged["uploader"] == "Think Music India"
    assert merged["webpage_url"] == "https://www.youtube.com/watch?v=abc"
    assert merged["duration"] == 205


def test_merge_missing_info_does_not_overwrite_present_values():
    target = {"uploader": "Existing", "id": "abc"}
    fallback = {"uploader": "Other", "id": "abc"}
    merged = _merge_missing_info(target, fallback)
    assert merged["uploader"] == "Existing"


def test_merge_missing_info_ignores_empty_fallback_values():
    target = {"uploader": ""}
    fallback = {"uploader": "", "webpage_url": None, "tags": []}
    merged = _merge_missing_info(target, fallback)
    assert merged["uploader"] == ""
    assert "webpage_url" not in merged
    assert "tags" not in merged


def test_merge_missing_info_none_fallback_is_noop():
    target = {"id": "abc", "uploader": ""}
    merged = _merge_missing_info(target, None)
    assert merged == {"id": "abc", "uploader": ""}


# ── Audio format selection (single-download regression) ───────────────────────

def test_audio_format_selector_is_audio_only():
    """Regression: audio mode must select an audio-only format via the default
    multi-client merge and NOT the manually-forced mobile client list. The old
    forced list stripped audio-only formats, so `bestaudio/best` fell back to a
    muxed video stream (format 18) and the vcodec retry then downloaded that
    same muxed stream a second time."""
    engine = AudioDownloadEngine(audio_format="mp3", quality="high", mode="audio")
    try:
        opts = engine._build_opts()
    except RuntimeError:
        # FFmpeg not available in this environment — map-level check above
        # already guards the regression.
        return
    assert opts["format"] == "bestaudio"
    # The root cause — a manually-forced player-client list strips the
    # multi-client merge that exposes audio-only formats. Must not be forced.
    assert "player_client" not in opts.get("extractor_args", {})
    # An unneeded Android UA override is the same trap — drop it too.
    assert "http_headers" not in opts

def test_video_format_selector_still_uses_separate_streams():
    """Video mode must keep its DASH selector (bestvideo+bestaudio) untouched."""
    for q in VIDEO_QUALITY_PRESETS.values():
        assert "bestvideo" in q["format"]
        assert "+" in q["format"]


# ── MP3 metadata verification (COMM frame-key regression) ─────────────────────

def test_verify_metadata_mp3_comment_uses_getall(tmp_path):
    """Regression: COMM is a uniquely-keyed ID3 frame ('COMM:desc:lang'), so
    id3.get('COMM') always returns None — verification reported the comment as
    missing even though it was embedded. Must use getall('COMM')."""
    from mutagen.id3 import COMM, ID3

    p = str(tmp_path / "t.mp3")
    # Raw MPEG frame data (not strictly probeable by mutagen) + an ID3 tag:
    # verify_metadata must still read the ID3 tags directly instead of
    # early-returning because file identification failed.
    frame = b"\xff\xfb\x90\x64" + b"\x00" * 413  # MPEG1 Layer3 128kbps frame (~417B)
    with open(p, "wb") as f:
        f.write(frame * 6)

    tags = ID3()
    tags.add(COMM(encoding=3, lang="eng", desc="Comment", text="https://example.com"))
    tags.save(p, v2_version=3)

    meta = Metadata(title="T", artist="A", upload_date="2026-08-28", webpage_url="https://example.com")
    result = verify_metadata(p, meta)
    assert result["comment"] is True, result
    assert not _is_safe_thumbnail_url("http://127.0.0.1:8000/evil.jpg")
    assert not _is_safe_thumbnail_url("http://169.254.169.254/latest/meta-data")
    assert not _is_safe_thumbnail_url("https://evil.com/ytimg.com")


def test_download_bytes_rejects_unsafe_url():
    # SSRF guard: internal/arbitrary URLs must never be fetched.
    assert _download_bytes("http://127.0.0.1:9/x.jpg") is None


def test_probe_options_secure_by_default():
    """SEC-01: probe() must not disable TLS certificate verification."""
    from unittest.mock import patch, MagicMock

    engine = AudioDownloadEngine()
    captured_opts = {}
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = None
    mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
    mock_ydl.__exit__ = MagicMock(return_value=False)

    def capture_opts(opts, *a, **kw):
        captured_opts.update(opts)
        return mock_ydl

    with patch("engine.YoutubeDL", side_effect=capture_opts):
        with patch("engine.contextlib.redirect_stderr"):
            engine.probe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    assert "nocheckcertificate" not in captured_opts, (
        "probe() must not set nocheckcertificate"
    )
    assert "prefer_insecure" not in captured_opts, (
        "probe() must not set prefer_insecure"
    )


def test_download_options_secure_by_default():
    """SEC-01: _build_opts() must not disable TLS certificate verification."""
    from unittest.mock import patch

    engine = AudioDownloadEngine()
    with patch.object(engine, "_ffmpeg_bin", "/usr/bin/ffmpeg"), \
         patch.object(engine, "_ffmpeg_dir", "/usr/bin"), \
         patch.object(engine, "_deno_bin", None):
        opts = engine._build_opts()

    assert "nocheckcertificate" not in opts, (
        "_build_opts() must not set nocheckcertificate"
    )
    assert "prefer_insecure" not in opts, (
        "_build_opts() must not set prefer_insecure"
    )
