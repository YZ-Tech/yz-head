"""yz-head — stylized robot-head avatar satellite for JarvYZ (dashboard variant 11).

A standalone HTTP service + dynamic-module UI. Owns a small library of head
meshes (.obj) that users can drop into the data dir, with per-mesh lip/eye
vertex calibration for amplitude-driven lipsync. Extracted from the in-core
v11 `FaceRobotMesh`.

Storage layout (under data_root, default ~/.jarvyz/satellites/yz-head/):
  meshes/        — .obj head meshes (drop your own here; face-model.obj seeded)
  metadata/      — _mesh_meta.json (per-mesh lip/eye indices) + _active_mesh.json
"""

__version__ = "0.0.1"
