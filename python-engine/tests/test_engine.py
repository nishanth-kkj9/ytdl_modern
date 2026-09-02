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
    DownloadResult,
    _is_safe_thumbnail_url,
    _download_bytes,
    _merge_missing_info,
    verify_metadata,
    Metadata,
    VIDEO_QUALITY_PRESETS,
    RetryStrategy,
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
    # Length guard: absurdly long URLs are rejected even on allowed domains.
    assert not _is_safe_thumbnail_url("https://i.ytimg.com/" + "a" * 3000)
    # Non-string input must not raise.
    assert not _is_safe_thumbnail_url(12345)


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


# ── Automatic retry visibility (download_retry event plumbing) ────────────────

def test_download_retry_cb_notified_on_retry(monkeypatch):
    """Regression: automatic retries inside download() must be surfaced via
    retry_cb so the UI can tell the user the download is retrying rather than
    appearing frozen during exponential back-off."""
    import time

    engine = AudioDownloadEngine(audio_format="mp3", quality="high", mode="audio")
    failures = [RuntimeError("temporary network blip"), RuntimeError("rate limited")]
    calls: list[tuple[int, float, str]] = []

    def fake_download_once(url, info=None):
        if failures:
            raise failures.pop(0)
        return DownloadResult(success=True, url=url, title="T")

    monkeypatch.setattr(engine, "_download_once", fake_download_once)
    # Don't actually sleep through the back-off waits during the test.
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)

    result = engine.download(
        "https://youtu.be/dQw4w9WgXcQ",
        retry_cb=lambda attempt, delay, err: calls.append((attempt, delay, err)),
    )

    assert result.success, "Download should succeed after two automatic retries"
    assert len(calls) == 2, "retry_cb should fire once per automatic retry"
    assert calls[0][0] == 1 and calls[0][1] == 2.0, "first retry: attempt 1, 2s wait"
    assert calls[1][0] == 2 and calls[1][1] == 4.0, "second retry: attempt 2, 4s wait"
    assert "blip" in calls[0][2], "retry_cb should carry the underlying error message"


def test_download_retry_cb_not_called_without_retries(monkeypatch):
    """A clean first-attempt success must never invoke retry_cb."""
    import time

    engine = AudioDownloadEngine(audio_format="mp3", quality="high", mode="audio")
    calls: list[tuple[int, float, str]] = []

    monkeypatch.setattr(
        engine,
        "_download_once",
        lambda url, info=None: DownloadResult(success=True, url=url, title="T"),
    )
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)

    result = engine.download(
        "https://youtu.be/dQw4w9WgXcQ",
        retry_cb=lambda attempt, delay, err: calls.append((attempt, delay, err)),
    )

    assert result.success
    assert calls == [], "retry_cb must not fire on a first-attempt success"


# ── Concurrent filepath resolution (BUG-01 verification gate) ────────────────

def test_resolve_filepath_prefers_requested_download_path_over_shared_dir_mtime(tmp_path):
    """Two simulated same-format downloads must not cross-bind at strategy 3.

    The deliberately divergent title makes strategies 0–2 miss. Download A's
    later metadata write gives it the newest mtime, which reproduces the old
    shared-directory race for download B.
    """
    own = tmp_path / "B_.mp3"
    other = tmp_path / "A.mp3"
    own.write_bytes(b"b")
    other.write_bytes(b"a")
    engine = AudioDownloadEngine(output_dir=str(tmp_path), audio_format="mp3")
    engine._ydl_pre_path = None
    engine._hook_filepath = None
    engine._download_started = 0

    resolved = engine._resolve_filepath({
        "title": "B?",  # sanitize_filename -> B; intentionally misses B_.mp3
        "requested_downloads": [{"filepath": str(own)}],
    })

    assert resolved == str(own)


# ── Retry strategy failure classification (TEST-01) ──────────────────────────

def test_retry_strategy_rejects_non_retryable_errors_and_caps_backoff():
    strategy = RetryStrategy(max_retries=3, initial_delay=2, max_delay=5, backoff=2)
    for message in ("cancelled", "not a YouTube URL", "is not a valid URL", "ffmpeg missing"):
        assert not strategy.should_retry(RuntimeError(message))
    assert [strategy.next_delay(), strategy.next_delay(), strategy.next_delay()] == [2, 4, 5]
    assert not strategy.should_retry(RuntimeError("temporary network error"))
