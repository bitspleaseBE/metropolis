"""Local DualShock reader for the street viewer.

Chrome on this Mac opens a DualShock 4 over WebHID and then never receives
input reports, and navigator.getGamepads() stays empty. GameController still
has the sticks, so the viewer server forwards that state to the page.
"""

from __future__ import annotations

import subprocess
import tempfile
import threading
from pathlib import Path

from cityview.paths import ROOT

_IDLE = b'{"ok":false}\n'


class PadBridge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._line = _IDLE

    def start(self) -> None:
        threading.Thread(target=self._run, name="pad-bridge", daemon=True).start()

    def snapshot(self) -> bytes:
        with self._lock:
            return self._line

    def _run(self) -> None:
        src = ROOT / "scripts" / "pad_bridge.swift"
        binary = Path(tempfile.gettempdir()) / "cityview-pad-bridge"
        try:
            if not binary.exists() or binary.stat().st_mtime < src.stat().st_mtime:
                subprocess.run(
                    ["swiftc", "-O", "-o", str(binary), str(src)],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            proc = subprocess.Popen(
                [str(binary)],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        except (OSError, subprocess.CalledProcessError):
            return
        if proc.stdout is None:
            return
        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            with self._lock:
                self._line = line + b"\n"
