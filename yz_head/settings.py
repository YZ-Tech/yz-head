"""Satellite-owned settings.

`data_root` — where the satellite stores its mesh library + metadata.
Defaults to `~/.jarvyz/satellites/yz-head/` (derived from JARVYZ_HOME, the
shared single source of truth), overridable via `JWT_HEAD_ROOT` env for test
sandboxes + multi-machine deployments.

Unlike yz-body, there is NO download-on-first-run: the default head mesh
(`face-model.obj`, ~660 KB) ships inside the wheel as package-data and is
seeded into the meshes dir on first run. Users add their own by dropping
`.obj` files into `<data_root>/meshes/`.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _default_data_root() -> Path:
    env = os.environ.get("JWT_HEAD_ROOT")
    if env:
        return Path(env)
    home = Path(os.environ.get("JARVYZ_HOME") or Path.home() / ".jarvyz")
    return home / "satellites" / "yz-head"


@dataclass
class Settings:
    """Snapshot of mutable satellite settings."""

    data_root: Path = field(default_factory=_default_data_root)

    @property
    def meshes_dir(self) -> Path:
        return self.data_root / "meshes"

    @property
    def metadata_dir(self) -> Path:
        return self.data_root / "metadata"


# Module singleton. persistent_settings.load() may replace fields from the
# on-disk JSON sidecar at boot.
settings = Settings()
