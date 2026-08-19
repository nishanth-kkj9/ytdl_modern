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
