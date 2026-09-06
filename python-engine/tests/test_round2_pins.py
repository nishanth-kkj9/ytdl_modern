"""Round-2 pin tests: P2-9 format validation, P3 filename cap, upload_date
digit validation. Each mirrors a defect from the audit that had no test."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from engine import AudioDownloadEngine as AudioDownloader, Metadata  # noqa: E402
from helpers import sanitize_filename  # noqa: E402


def test_unknown_audio_format_fails_fast():
    """P2-9: an unsupported audio_format must raise at construction — the old
    code silently coerced the postprocessor to opus while the hook and file
    resolution still looked for the requested extension, producing a confusing
    downstream verify failure."""
    with pytest.raises(ValueError, match="Unsupported audio_format 'flac'"):
        AudioDownloader(output_dir="/tmp", audio_format="flac", mode="audio")


def test_video_mode_does_not_validate_audio_format():
    """The format is ignored in video mode, so the guard must not fire there."""
    AudioDownloader(output_dir="/tmp", audio_format="m4a", mode="video")


def test_sanitize_filename_caps_component_length():
    """P3: >255-byte filename components raise ENAMETOOLONG; titles are
    attacker-controlled, so the sanitizer must cap them."""
    name = "x" * 5000
    capped = sanitize_filename(name)
    assert len(capped) <= 200
    assert capped == "x" * 200


def test_metadata_upload_date_requires_digits():
    """P3: "abcd1234" (8 chars, non-numeric) used to become the tag
    "abcd-1234". Only 8-digit values may be reformatted."""
    assert Metadata.from_info({"upload_date": "20240115"}).upload_date == "2024-01-15"
    assert Metadata.from_info({"upload_date": "abcd1234"}).upload_date == ""
    assert Metadata.from_info({"upload_date": ""}).upload_date == ""