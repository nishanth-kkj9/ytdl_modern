"""Unit tests for the IPC layer in ipc_main.py.

Key focus: regression tests for the P1 path-traversal (SEC-02) fix that
prevents the engine from writing output files outside the project downloads
directory.
"""
import os
import sys

# Make `import ipc_main` resolve the sibling engine module directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ipc_main import _resolve_output_dir, _YDL_PROJECT_ROOT  # noqa: E402


_BASE = os.path.realpath(os.path.join(_YDL_PROJECT_ROOT, "..", "downloads"))


def test_allow_project_downloads_dir():
    assert _resolve_output_dir(_BASE) == _BASE


def test_allow_subdirectory_inside_downloads():
    sub = os.path.join(_BASE, "subfolder")
    assert _resolve_output_dir(sub) == sub


def test_reject_etc_cron_d():
    assert _resolve_output_dir("/etc/cron.d") is None


def test_reject_tmp_evil():
    assert _resolve_output_dir(os.path.join(os.path.sep, "tmp", "evil")) is None


def test_reject_windows_system_dir():
    # Must reject arbitrary absolute system paths (cross-platform guard).
    assert _resolve_output_dir("C:\\Windows") is None


def test_default_resolves_to_downloads():
    assert _resolve_output_dir("") == _BASE
