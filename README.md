# yz-head

Stylized **robot-head avatar** for JarvYZ — dashboard **variant 11**. Extracted
from the in-core `v11` `FaceRobotMesh`.

A wireframe/metallic robot head rendered from a `.obj` mesh, with
**amplitude-driven lipsync**: while JarvYZ is speaking, a set of mesh vertices
tagged as "lips" are displaced proportionally to the live TTS loudness
(`tts_level` over the host WS bus); eyes react while listening. No phonemes /
visemes — loudness only.

## Bring your own head mesh

The avatar is not tied to one mesh. Drop additional `.obj` files into:

    ~/.jarvyz/satellites/yz-head/meshes/

and pick the active one in the dashboard settings. Because lipsync displaces
**vertex indices into a specific mesh**, each mesh needs its lip/eye vertices
calibrated once — use the in-dashboard paint picker (right-click-drag to tag
lips/eyes). The calibration is stored per-mesh server-side
(`metadata/_mesh_meta.json`), so it survives mesh switches and restarts.

The default mesh (`face-model.obj`, ~660 KB) ships inside the wheel and is
seeded on first run with baked lip/eye indices, so it works out of the box.

## Service

`python -m yz_head` → HTTP service on `127.0.0.1:9006` (override `HEAD_HOST` /
`HEAD_PORT`). JarvYZ proxies it at `/api/head`.

| Route | Purpose |
|---|---|
| `GET /health` | liveness + mesh count |
| `GET /meshes` | list library `.obj` meshes |
| `POST /meshes` | upload a new mesh (multipart) |
| `GET/POST /meshes/active` | read / switch the active mesh |
| `GET /meshes/meta?file=` | per-mesh lip/eye indices |
| `POST /meshes/meta` | save per-mesh calibration |
| `GET/PATCH /settings` | `data_root` |
| `WS /events` | library-mutation events |
| `/assets/meshes/<file>` | raw OBJ bytes (browser OBJLoader) |
| `/` | the built standalone SPA |

No motion catalog / `onPromptBuild` / tools — the head only consumes the host's
`tts_level` / `audio_level` / `mode` / `announce` WS events for its animation.
