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

from engine import AudioDownloadEngine, _is_safe_thumbnail_url, _download_bytes  # noqa: E402


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
