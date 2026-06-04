"""Load/save the satellite's settings to a JSON sidecar in the data dir.

Only `data_root` is user-settable today. The sidecar lives at
`<data_root>/settings.json`. `JWT_HEAD_SETTINGS_ROOT` overrides where the
sidecar is read from (test isolation), independent of the data_root the
settings then point at.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .settings import Settings, settings


def _sidecar_path() -> Path:
    root = os.environ.get("JWT_HEAD_SETTINGS_ROOT")
    base = Path(root) if root else settings.data_root
    return base / "settings.json"


def load() -> None:
    """Replace settings fields from the on-disk sidecar, if present."""
    p = _sidecar_path()
    if not p.is_file():
        return
    try:
        data = json.loads(p.read_text("utf-8"))
    except Exception:  # noqa: BLE001 — corrupt sidecar -> keep defaults
        return
    if isinstance(data, dict) and isinstance(data.get("data_root"), str) and data["data_root"]:
        settings.data_root = Path(data["data_root"])


def save() -> None:
    p = _sidecar_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"data_root": str(settings.data_root)}, indent=2), "utf-8")


def apply_patch(patch: dict[str, Any]) -> Settings:
    """Apply a partial settings update + persist. Returns the new snapshot."""
    if isinstance(patch.get("data_root"), str) and patch["data_root"]:
        settings.data_root = Path(patch["data_root"])
    save()
    return settings
