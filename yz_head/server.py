"""yz-head HTTP service — the robot-head avatar's backend.

Owns a small library of head meshes (.obj) the user can extend by dropping
files into `<data_root>/meshes/`, plus per-mesh lip/eye vertex calibration
used by the UI's amplitude-driven lipsync. Extracted from the in-core v11
`FaceRobotMesh` (which hardcoded a single `/face-model.obj` + baked indices).

Routes (NO /api/head prefix — the JarvYZ-side proxy adds it):
  GET  /health
  GET  /meshes                  · list .obj meshes in the library
  POST /meshes                  · upload a new .obj (multipart)
  GET  /meshes/active           · {file} of the active mesh
  POST /meshes/active  {file}    · switch active mesh
  GET  /meshes/meta?file=X       · {lipIndices, eyeIndices} for one mesh
  POST /meshes/meta {file, lipIndices, eyeIndices} · save per-mesh calibration
  GET/PATCH /settings           · data_root
  WS   /events                  · library-mutation events
  /assets/meshes/<file>          · raw OBJ bytes (browser OBJLoader fetches these)
  /                              · the built SPA (standalone)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from . import observer, persistent_settings
from .__init__ import __version__
from .settings import settings

app = FastAPI(title="yz-head", version=__version__)

# Load the on-disk settings sidecar (data_root) before deriving paths.
persistent_settings.load()


# ────────────────────────── paths ──────────────────────────────────────

_OBJ_EXTS = {".obj"}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9 ._-]+\.obj$")


def _meshes_dir() -> Path:
    return settings.meshes_dir


def _meta_dir() -> Path:
    return settings.metadata_dir


def _mesh_meta_file() -> Path:
    return _meta_dir() / "_mesh_meta.json"


def _active_mesh_file() -> Path:
    return _meta_dir() / "_active_mesh.json"


def _bundled(name: str) -> Path:
    return Path(__file__).parent / "assets" / name


# ────────────────────────── seed on first run ──────────────────────────


def _ensure_seed() -> None:
    """Seed the default head mesh + its baked lip/eye calibration on first
    run. No network — the default ships in the wheel as package-data."""
    md = _meshes_dir()
    md.mkdir(parents=True, exist_ok=True)
    _meta_dir().mkdir(parents=True, exist_ok=True)
    if not any(md.glob("*.obj")):
        src = _bundled("face-model.obj")
        if src.is_file():
            shutil.copy(src, md / "face-model.obj")
            print("[head] first run — seeded default mesh face-model.obj", file=sys.stderr)
        meta_seed = _bundled("default_mesh_meta.json")
        if meta_seed.is_file() and not _mesh_meta_file().is_file():
            shutil.copy(meta_seed, _mesh_meta_file())
        if not _active_mesh_file().is_file():
            _active_mesh_file().write_text(json.dumps({"file": "face-model.obj"}), "utf-8")


# ────────────────────────── meta helpers ───────────────────────────────


def _load_mesh_meta() -> dict[str, dict[str, list[int]]]:
    f = _mesh_meta_file()
    if not f.is_file():
        return {}
    try:
        data = json.loads(f.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return {}
    m = data.get("meshes") if isinstance(data, dict) else None
    return m if isinstance(m, dict) else {}


def _save_mesh_meta(meshes: dict[str, dict[str, list[int]]]) -> None:
    _meta_dir().mkdir(parents=True, exist_ok=True)
    tmp = _mesh_meta_file().with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"meshes": meshes}), "utf-8")
    tmp.replace(_mesh_meta_file())


def _list_meshes() -> list[str]:
    md = _meshes_dir()
    if not md.is_dir():
        return []
    return sorted(p.name for p in md.iterdir() if p.suffix.lower() in _OBJ_EXTS)


# ────────────────────────── routes ──────────────────────────────────────


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "data_root": str(settings.data_root),
        "mesh_count": len(_list_meshes()),
    }


@app.get("/meshes")
def list_meshes() -> dict:
    _ensure_seed()
    return {"meshes": [{"file": f} for f in _list_meshes()]}


@app.post("/meshes")
async def upload_mesh(file: UploadFile) -> dict:
    """Upload a head .obj into the library (the UI's drag-drop path; users
    can equally just drop files into <data_root>/meshes/ by hand)."""
    _ensure_seed()
    name = (file.filename or "").strip()
    if not _SAFE_NAME.match(name):
        raise HTTPException(400, "filename must be a simple name ending in .obj")
    dest = _meshes_dir() / name
    content = await file.read()
    dest.write_bytes(content)
    observer.emit("mesh_added", file=name)
    return {"ok": True, "file": name, "size_bytes": len(content)}


@app.get("/meshes/active")
def get_active() -> dict:
    _ensure_seed()
    f = _active_mesh_file()
    file = None
    if f.is_file():
        try:
            file = json.loads(f.read_text("utf-8")).get("file")
        except Exception:  # noqa: BLE001
            file = None
    meshes = _list_meshes()
    if file not in meshes:
        file = meshes[0] if meshes else None
    return {"file": file}


@app.post("/meshes/active")
def set_active(body: dict = Body(...)) -> dict:
    file = body.get("file")
    if not isinstance(file, str) or file not in _list_meshes():
        raise HTTPException(404, "mesh not found")
    _meta_dir().mkdir(parents=True, exist_ok=True)
    _active_mesh_file().write_text(json.dumps({"file": file}), "utf-8")
    observer.emit("active_changed", file=file)
    return {"ok": True, "file": file}


@app.get("/meshes/meta")
def get_meta(file: str) -> dict:
    """Per-mesh lip/eye vertex indices. Empty arrays if the mesh hasn't been
    calibrated yet (a freshly-dropped custom mesh)."""
    entry = _load_mesh_meta().get(file) or {}
    return {
        "file": file,
        "lipIndices": entry.get("lipIndices", []),
        "eyeIndices": entry.get("eyeIndices", []),
    }


@app.post("/meshes/meta")
def set_meta(body: dict = Body(...)) -> dict:
    file = body.get("file")
    if not isinstance(file, str) or not file:
        raise HTTPException(400, "file required")
    lip = body.get("lipIndices")
    eye = body.get("eyeIndices")
    if not isinstance(lip, list) or not isinstance(eye, list):
        raise HTTPException(400, "lipIndices + eyeIndices must be arrays")
    meshes = _load_mesh_meta()
    meshes[file] = {
        "lipIndices": [int(i) for i in lip if isinstance(i, (int, float))],
        "eyeIndices": [int(i) for i in eye if isinstance(i, (int, float))],
    }
    _save_mesh_meta(meshes)
    observer.emit("meta_saved", file=file)
    return {"ok": True, "file": file}


@app.get("/settings")
def get_settings() -> dict:
    return {"data_root": str(settings.data_root)}


@app.patch("/settings")
def patch_settings(body: dict = Body(...)) -> dict:
    s = persistent_settings.apply_patch(body)
    return {"data_root": str(s.data_root)}


@app.websocket("/events")
async def events_ws(ws: WebSocket) -> None:
    await ws.accept()
    q = observer.subscribe()
    try:
        await ws.send_json({"event": "head", "kind": "hello"})
        while True:
            await ws.send_json(await q.get())
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        observer.unsubscribe(q)


# ────────────────────────── mesh bytes (OBJ) ───────────────────────────
# The browser's OBJLoader fetches the active mesh from here. Mounted BEFORE
# the SPA catch-all. Dir created eagerly (+ seeded) so the mount + first
# fetch succeed.
_ensure_seed()
app.mount("/assets/meshes", StaticFiles(directory=str(_meshes_dir())), name="meshes")


# ────────────────────────── SPA mount (last) ───────────────────────────

_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")


# ────────────────────────── entrypoint ─────────────────────────────────


def main() -> None:
    """`python -m yz_head` entry point."""
    import uvicorn

    host = os.environ.get("HEAD_HOST", "127.0.0.1")
    # YZ_PORT (core-resolved, settings.ports) wins; HEAD_PORT + default for standalone.
    port = int(os.environ.get("YZ_PORT") or os.environ.get("HEAD_PORT") or "9006")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
