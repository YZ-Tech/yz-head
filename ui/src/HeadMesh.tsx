import BrushIcon from '@mui/icons-material/Brush'
import DeleteIcon from '@mui/icons-material/Delete'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye'
import SaveIcon from '@mui/icons-material/Save'
import { Box, CircularProgress, Paper, Stack } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { IconBtn } from './components/IconBtn'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useWebSocket, useSubscription } from './lib/ws'
import { apiUrl, assetUrl } from './lib/assetBase'

/** Dashboard variant 11 — HeadMesh. Three.js port. Loads
 *  /face-model.obj as a real 3D mesh, renders it with a dark metallic
 *  surface material (so we get true z-buffered depth occlusion) and a
 *  cyan wireframe overlay built from EdgesGeometry (so only the silhouette
 *  edges show — no interior triangulation noise). OrbitControls owns the
 *  camera; mode WS events drive wireframe color and rotation/scale. */

type Mode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'boot'

interface ModeProfile {
  /** Wireframe color (hex, applied via Color.lerp for smooth transitions). */
  wireColor: number
  /** Scale-pulse multiplier on TTS amplitude (1.0 = +100% at max amp). */
  scalePulse: number
}

const MODE_PROFILES: Record<Mode, ModeProfile> = {
  idle:      { wireColor: 0x7dd3fc, scalePulse: 0.00 },
  listening: { wireColor: 0x86efac, scalePulse: 0.00 },
  thinking:  { wireColor: 0xc4b5fd, scalePulse: 0.00 },
  speaking:  { wireColor: 0xfbbf24, scalePulse: 0.00 },
  boot:      { wireColor: 0xfde047, scalePulse: 0.00 },
}

/** Lerp Three.js Color in-place toward target by `t`. */
function lerpColor(target: THREE.Color, hex: number, t: number) {
  const dst = new THREE.Color(hex)
  target.lerp(dst, t)
}

/** Brush sphere radius in mesh-local coords (~3% of head size). */
const BRUSH_RADIUS = 0.12

type PickerMode = 'off' | 'lips' | 'eyes'

/** Hand-painted eye vertex indices (upper + lower lid of both eyes).
 *  Loaded as the default when nothing is in localStorage. */
const EYE_INDICES_DEFAULT: number[] = [
  0, 1, 3, 24, 25, 27, 198, 201, 203, 351, 354, 356, 384, 387, 389, 390, 391,
  392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406,
  407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 422, 424,
  425, 428, 430, 431, 432, 433, 435, 456, 457, 458, 459, 460, 461, 462, 463,
  464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 475, 476, 478, 486, 489,
  491, 492, 495, 497, 506, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517,
  518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 529, 530, 532, 534, 535,
  536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550,
  551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565,
  566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580,
  581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595,
  596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625,
  626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640,
  641, 1074, 1077, 1079, 1098, 1101, 1103, 1272, 1273, 1275, 1425, 1426, 1428,
  1458, 1459, 1461, 1464, 1465, 1466, 1467, 1468, 1469, 1470, 1471, 1472, 1473,
  1474, 1475, 1476, 1477, 1478, 1479, 1480, 1481, 1482, 1483, 1484, 1485, 1486,
  1487, 1488, 1489, 1490, 1491, 1492, 1493, 1495, 1496, 1498, 1501, 1502, 1504,
  1506, 1509, 1511, 1530, 1531, 1532, 1533, 1534, 1535, 1536, 1537, 1538, 1539,
  1540, 1541, 1542, 1543, 1544, 1545, 1546, 1547, 1550, 1552, 1553, 1559, 1560,
  1561, 1563, 1566, 1567, 1568, 1569, 1570, 1577, 1578, 1579, 1580, 1581, 1582,
  1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1593, 1594, 1595, 1596,
  1597, 1598, 1599, 1600, 1601, 1604, 1606, 1607, 1608, 1609, 1610, 1611, 1612,
  1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1621, 1622, 1623, 1624, 1625,
  1626, 1627, 1628, 1629, 1630, 1631, 1632, 1633, 1634, 1635, 1636, 1637, 1638,
  1639, 1640, 1641, 1642, 1643, 1644, 1645, 1646, 1647, 1648, 1649, 1650, 1651,
  1652, 1653, 1654, 1655, 1656, 1657, 1658, 1659, 1660, 1661, 1662, 1663, 1664,
  1665, 1666, 1667, 1668, 1669, 1670, 1671, 1672, 1673, 1674, 1675, 1676, 1677,
  1678, 1679, 1680, 1681, 1682, 1683, 1684, 1685, 1686, 1687, 1688, 1689, 1690,
  1691, 1692, 1693, 1694, 1695, 1696, 1697, 1698, 1699, 1700, 1701, 1702, 1703,
  1704, 1705, 1706, 1707, 1708, 1709, 1710, 1711, 1712, 1713, 1714, 1715,
]

/** Hand-painted lip vertex indices (the picker UI is the source of these;
 *  see right-click brush). Loaded as the default when nothing is in
 *  localStorage. */
const LIP_INDICES_DEFAULT: number[] = [
  8, 10, 11, 13, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
  46, 47, 48, 49, 50, 51, 52, 53, 55, 56, 58, 65, 66, 68, 69, 70, 71, 72, 73, 74,
  75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 164, 166, 167, 169,
  170, 172, 176, 178, 179, 805, 806, 808, 812, 814, 815, 851, 854, 856, 857, 1081,
  1082, 1084, 1091, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113,
  1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126,
  1127, 1129, 1130, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1140, 1141, 1142,
  1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155,
  1156, 1157, 1158, 1159, 1160, 1161, 1162, 1163, 1171, 1237, 1238, 1240, 1244,
  1246, 1247, 1249, 1250, 1252, 1880, 1882, 1883, 1885, 1886, 1888, 1921, 1922,
  1924, 1927, 1928, 1930,
]

export function HeadMesh() {
  const { send, isConnected } = useWebSocket()
  const containerRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const targetVoice = useRef(0)
  const targetMic = useRef(0)
  const voiceSmooth = useRef(0)
  const micSmooth = useRef(0)
  // The active head mesh file (from the satellite) + a guard so the
  // initial backend-seed of lip/eye indices doesn't immediately POST them
  // back (a transient fetch miss must NOT clobber saved calibration).
  const activeMeshFileRef = useRef<string>('face-model.obj')
  const calibrationLoadedRef = useRef(false)
  // Lip-sync state (level 1) — populated after OBJ load.
  // Right-click + drag on the mesh paints lip verts via raycaster;
  // shift+right-click removes. Persisted to localStorage per LIP_LS_KEY.
  const faceMeshRef = useRef<THREE.Mesh | null>(null)
  const lipIndicesRef = useRef<number[]>([])
  const lipOriginalRef = useRef<Float32Array | null>(null)
  const dbgPointsRef = useRef<THREE.Points | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const brushMeshRef = useRef<THREE.Mesh | null>(null)
  const brushGeomCleanupRef = useRef<(() => void) | null>(null)
  const refreshLipStateRef = useRef<((indices: number[]) => void) | null>(null)
  /** Centroid X of the current lip set, in raw mesh-local coords.
   *  Used to classify each lip vert as upper (closer to crown = lower X)
   *  or lower (closer to chin = higher X) during the per-frame deform. */
  const lipCentroidXRef = useRef(0)
  // Eye picker mirrors the lip picker: same paint pipeline, separate
  // index set, separate dot color (cyan), separate localStorage. Used
  // for the blink animation in the render loop.
  const eyeIndicesRef = useRef<number[]>([])
  const eyeOriginalRef = useRef<Float32Array | null>(null)
  const eyeDbgPointsRef = useRef<THREE.Points | null>(null)
  const refreshEyeStateRef = useRef<((indices: number[]) => void) | null>(null)
  const eyeCentroidXRef = useRef(0)
  /** Target X for upper-eyelid verts when fully closed — the avg X of
   *  the lower-eyelid verts (so the upper lid travels all the way down
   *  to meet the lower lid on blink). */
  const eyeLowerCentroidXRef = useRef(0)
  /** Eye-blink state machine. `phase` cycles wait → close → hold → open
   *  → wait; `t` accumulates seconds within the current phase; `next` is
   *  the randomized wait duration before the next blink. */
  const blinkRef = useRef<{ phase: 'wait' | 'close' | 'hold' | 'open'; t: number; next: number }>({
    phase: 'wait',
    t: 0,
    // eslint-disable-next-line react-hooks/purity -- one-shot randomized initial wait, useRef has no lazy-init API
    next: 2 + Math.random() * 4,
  })
  // Master switch for the picker. 'off' hides all dots and right-click
  // does nothing. 'lips' / 'eyes' enables painting + dot visibility for
  // that set. Left-click always rotates regardless.
  const [pickerMode, setPickerMode] = useState<PickerMode>('off')
  const pickerModeRef = useRef<PickerMode>('off')
  useEffect(() => {
    pickerModeRef.current = pickerMode
    if (dbgPointsRef.current) dbgPointsRef.current.visible = pickerMode === 'lips'
    if (eyeDbgPointsRef.current) eyeDbgPointsRef.current.visible = pickerMode === 'eyes'
  }, [pickerMode])
  const [mode, setMode] = useState<Mode>('boot')
  const modeRef = useRef<Mode>('boot')
  // eslint-disable-next-line react-hooks/purity -- one-shot timestamp at mount, useRef has no lazy-init API
  const modeChangedAt = useRef(performance.now())
  useEffect(() => {
    modeRef.current = mode
    modeChangedAt.current = performance.now()
  }, [mode])

  // Auto-exit boot after assembly anim completes.
  useEffect(() => {
    if (mode !== 'boot') return
    const t = setTimeout(() => setMode('idle'), 2500)
    return () => clearTimeout(t)
  }, [mode])

  const preAnnounceModeRef = useRef<Mode | null>(null)
  useSubscription<{ state: string }>('announce', (d) => {
    if (d.state === 'start') {
      if (preAnnounceModeRef.current === null) preAnnounceModeRef.current = modeRef.current
      setMode('speaking')
    } else if (d.state === 'end') {
      const prev = preAnnounceModeRef.current ?? 'idle'
      preAnnounceModeRef.current = null
      setMode(prev)
    }
  })

  useEffect(() => {
    if (!isConnected) return
    send({ type: 'subscribe_event', event_type: 'tts_level' })
    send({ type: 'subscribe_event', event_type: 'audio_level' })
    return () => {
      send({ type: 'unsubscribe_event', event_type: 'tts_level' })
      send({ type: 'unsubscribe_event', event_type: 'audio_level' })
    }
  }, [send, isConnected])

  useSubscription<{ rms: number }>('tts_level', (d) => {
    if (modeRef.current === 'speaking') targetVoice.current = d.rms
  })
  useSubscription<{ rms: number }>('audio_level', (d) => {
    if (modeRef.current === 'listening') targetMic.current = d.rms
  })
  useSubscription<{ state: string }>('mode', (d) => {
    if (['idle', 'listening', 'thinking', 'speaking', 'boot'].includes(d.state)) {
      setMode(d.state as Mode)
    }
  })

  // ── Three.js scene setup + render loop ───────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x04060e)

    const camera = new THREE.PerspectiveCamera(
      35,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    )
    camera.position.set(0, 0, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    // Lighting — cool ambient + warmer key + cyan rim so the metallic
    // surface reads with depth even when stationary.
    scene.add(new THREE.AmbientLight(0x4060a0, 0.55))
    const key = new THREE.DirectionalLight(0xffe9c2, 0.9)
    key.position.set(3, 4, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.4)
    rim.position.set(-4, 1, -3)
    scene.add(rim)

    // OrbitControls — yaw + pitch only, no panning, no roll. Limiting
    // the polar angle keeps the camera away from the poles so the model
    // never appears to flip around the view axis (= the "wrong axis"
    // roll the user was seeing).
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 2.5
    controls.maxDistance = 12
    controls.minPolarAngle = Math.PI / 4 // 45° from +Y — caps upward tilt
    controls.maxPolarAngle = (3 * Math.PI) / 4 // 135° from +Y — caps downward tilt
    orbitRef.current = controls

    // Container group lets us animate scale/opacity without disturbing
    // the underlying mesh transforms. A small counter-clockwise tilt
    // around world Z straightens the model's centerline (it's authored
    // with a slight clockwise lean from the viewer's perspective).
    const root = new THREE.Group()
    root.rotation.z = (3 * Math.PI) / 180
    scene.add(root)

    // Materials — held in refs so we can mutate them from the WS effects.
    const wireMat = new THREE.LineBasicMaterial({
      color: MODE_PROFILES.boot.wireColor,
      transparent: true,
      opacity: 0,
      // depthWrite=true so each wire fragment writes its depth — without
      // this, back-of-eye edges can paint over the front-of-eye edges
      // (the LineSegments draw order is arbitrary, so it'd show on one
      // eye and not the other depending on geometry).
      depthWrite: true,
    })
    const fillMat = new THREE.MeshStandardMaterial({
      color: 0x1c2030,
      metalness: 0.7,
      roughness: 0.55,
      transparent: true,
      opacity: 0,
      // DoubleSide because this OBJ was authored with one eye's face
      // winding inverted — under default FrontSide culling, one eye
      // renders its outside (correct) and the other renders its inside
      // (showing the back wall through the front). DoubleSide draws
      // both faces of every triangle so the asymmetry disappears.
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })

    let cleanupMesh: (() => void) | null = null

    const _loadOnce = (meshFile: string) => new OBJLoader().load(
      assetUrl(`meshes/${meshFile}`),
      (obj) => {
        activeMeshFileRef.current = meshFile
        // OBJLoader returns a Group of Mesh children. Walk + collect
        // geometries; merge for a single edges pass.
        const meshes: THREE.Mesh[] = []
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
        })
        if (meshes.length === 0) {
          setLoadError('OBJ contained no meshes')
          return
        }

        // Normalize: center on origin, scale longest axis to ~3 units so
        // the camera framing matches the old Canvas 2D look.
        const box = new THREE.Box3()
        for (const m of meshes) {
          m.geometry.computeBoundingBox()
          box.expandByObject(m)
        }
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const longest = Math.max(size.x, size.y, size.z) || 1
        const targetScale = 3.0 / longest

        const meshGroup = new THREE.Group()
        for (const m of meshes) {
          m.geometry.translate(-center.x, -center.y, -center.z)
          m.material = fillMat
          meshGroup.add(m)
          // Edges overlay — silhouette + creases sharper than 1°. We use
          // EdgesGeometry just to FILTER edges by angle, then rebuild a
          // new geometry that SHARES the mesh's position attribute via an
          // index buffer. Sharing means lip-deformation on the mesh
          // automatically updates the wireframe too (otherwise the wires
          // are frozen at original positions while the fill warps under
          // them — the "black overlay" artifact).
          const edges = new THREE.EdgesGeometry(m.geometry, 1)
          const edgePos = edges.attributes.position.array as Float32Array
          const meshPos = m.geometry.attributes.position.array as Float32Array
          // Build a "position → vertex index" lookup. toFixed(5) is more
          // than enough precision: the centered mesh fits inside ±2 units
          // and 5 decimals gives ~0.00001 unit resolution, well below any
          // real vertex spacing.
          const posLookup = new Map<string, number>()
          for (let i = 0; i < meshPos.length / 3; i++) {
            const key = `${meshPos[i * 3].toFixed(5)}|${meshPos[i * 3 + 1].toFixed(5)}|${meshPos[i * 3 + 2].toFixed(5)}`
            posLookup.set(key, i)
          }
          const edgeIndex: number[] = []
          for (let i = 0; i < edgePos.length / 3; i++) {
            const key = `${edgePos[i * 3].toFixed(5)}|${edgePos[i * 3 + 1].toFixed(5)}|${edgePos[i * 3 + 2].toFixed(5)}`
            const v = posLookup.get(key)
            if (v !== undefined) edgeIndex.push(v)
          }
          edges.dispose() // we have what we needed (the filtered edge pairs)
          const sharedWire = new THREE.BufferGeometry()
          sharedWire.setAttribute('position', m.geometry.attributes.position)
          sharedWire.setIndex(edgeIndex)
          const wire = new THREE.LineSegments(sharedWire, wireMat)
          meshGroup.add(wire)
        }
        meshGroup.scale.setScalar(targetScale)
        // Source model lies on its right ear: crown along world -X,
        // chin along +X. Rotate -90° around Z so -X → +Y (upright),
        // then nudge -35° around Y so the face turns from
        // viewer's-right to straight-on.
        meshGroup.rotation.z = -Math.PI / 2
        meshGroup.rotation.y = -(35 * Math.PI) / 180
        root.add(meshGroup)

        // ── Lip tagging (paint picker + persist) ─────────────────
        // Largest mesh = the face. We track which vertex indices are
        // "lip" verts in a Set; the user paints them on with a brush.
        // The set persists to localStorage so reloads keep the picks.
        const faceMesh = meshes.reduce((a, b) =>
          a.geometry.attributes.position.count >= b.geometry.attributes.position.count ? a : b,
        )
        faceMeshRef.current = faceMesh

        // Debug Points overlay — magenta dots on whatever's currently
        // tagged. Initialized empty; rebuilt every time the set changes.
        const dbgGeom = new THREE.BufferGeometry()
        dbgGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
        const dbgPoints = new THREE.Points(
          dbgGeom,
          new THREE.PointsMaterial({
            color: 0xff00ff,
            size: 0.10,
            sizeAttenuation: true,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 1,
          }),
        )
        dbgPoints.renderOrder = 999
        dbgPoints.visible = pickerModeRef.current === 'lips'
        meshGroup.add(dbgPoints)
        dbgPointsRef.current = dbgPoints

        // Eye dot overlay — cyan, same setup as lips.
        const eyeDbgGeom = new THREE.BufferGeometry()
        eyeDbgGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
        const eyeDbgPoints = new THREE.Points(
          eyeDbgGeom,
          new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.10,
            sizeAttenuation: true,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 1,
          }),
        )
        eyeDbgPoints.renderOrder = 999
        eyeDbgPoints.visible = pickerModeRef.current === 'eyes'
        meshGroup.add(eyeDbgPoints)
        eyeDbgPointsRef.current = eyeDbgPoints

        // Helper: rebuild lipOriginal Float32Array + debug geometry from
        // current indices. Called after every paint stroke. Persists.
        const refreshLipState = (indices: number[]) => {
          const pos = faceMesh.geometry.attributes.position.array as Float32Array
          const orig = new Float32Array(indices.length * 3)
          for (let k = 0; k < indices.length; k++) {
            const i = indices[k]
            orig[k * 3] = pos[i * 3]
            orig[k * 3 + 1] = pos[i * 3 + 1]
            orig[k * 3 + 2] = pos[i * 3 + 2]
          }
          lipIndicesRef.current = indices
          lipOriginalRef.current = orig
          // Cache centroid X (chin-crown axis) for the lower/upper split.
          let cx = 0
          for (let k = 0; k < indices.length; k++) cx += orig[k * 3]
          lipCentroidXRef.current = indices.length ? cx / indices.length : 0
          dbgGeom.setAttribute('position', new THREE.BufferAttribute(orig.slice(), 3))
          // Persist THIS mesh's lip calibration to the satellite (per-mesh).
          // Guarded so the initial backend-seed doesn't re-POST — a fetch
          // miss must not clobber saved calibration with the defaults.
          if (calibrationLoadedRef.current) {
            void fetch(apiUrl('/meshes/meta'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file: activeMeshFileRef.current,
                lipIndices: indices,
                eyeIndices: eyeIndicesRef.current,
              }),
            }).catch(() => {})
          }
        }
        refreshLipStateRef.current = refreshLipState

        // Eye refresh — same shape as lip, but computes BOTH the all-eye
        // centroid (to split upper/lower) AND the lower-eyelid centroid
        // (the X target for upper-lid verts during blink).
        const refreshEyeState = (indices: number[]) => {
          const pos = faceMesh.geometry.attributes.position.array as Float32Array
          const orig = new Float32Array(indices.length * 3)
          for (let k = 0; k < indices.length; k++) {
            const i = indices[k]
            orig[k * 3] = pos[i * 3]
            orig[k * 3 + 1] = pos[i * 3 + 1]
            orig[k * 3 + 2] = pos[i * 3 + 2]
          }
          eyeIndicesRef.current = indices
          eyeOriginalRef.current = orig
          let cAll = 0
          for (let k = 0; k < indices.length; k++) cAll += orig[k * 3]
          cAll = indices.length ? cAll / indices.length : 0
          let lowerSum = 0
          let lowerCount = 0
          for (let k = 0; k < indices.length; k++) {
            if (orig[k * 3] > cAll) {
              lowerSum += orig[k * 3]
              lowerCount++
            }
          }
          eyeCentroidXRef.current = cAll
          eyeLowerCentroidXRef.current = lowerCount > 0 ? lowerSum / lowerCount : cAll
          eyeDbgGeom.setAttribute('position', new THREE.BufferAttribute(orig.slice(), 3))
          if (calibrationLoadedRef.current) {
            void fetch(apiUrl('/meshes/meta'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file: activeMeshFileRef.current,
                lipIndices: lipIndicesRef.current,
                eyeIndices: indices,
              }),
            }).catch(() => {})
          }
        }
        refreshEyeStateRef.current = refreshEyeState

        // Lip/eye calibration for THIS mesh comes from the satellite
        // (per-mesh). Fall back to the baked defaults (which fit the bundled
        // face-model.obj) when the backend has none yet — a freshly dropped
        // custom mesh — or is unreachable. Setting calibrationLoaded last
        // re-enables saving, so subsequent paint strokes persist.
        void (async () => {
          let lip: number[] = LIP_INDICES_DEFAULT
          let eye: number[] = EYE_INDICES_DEFAULT
          try {
            const r = await fetch(
              apiUrl(`/meshes/meta?file=${encodeURIComponent(meshFile)}`),
            )
            if (r.ok) {
              const d = await r.json()
              if (Array.isArray(d?.lipIndices) && d.lipIndices.length) lip = d.lipIndices
              if (Array.isArray(d?.eyeIndices) && d.eyeIndices.length) eye = d.eyeIndices
            }
          } catch {
            /* keep baked defaults */
          }
          refreshLipState(lip)
          refreshEyeState(eye)
          calibrationLoadedRef.current = true
        })()

        // Brush indicator — small wireframe sphere at the raycast point
        // while paint mode is active. Hidden otherwise.
        const brushGeom = new THREE.SphereGeometry(BRUSH_RADIUS, 12, 8)
        const brushMat = new THREE.MeshBasicMaterial({
          color: 0xff00ff,
          wireframe: true,
          transparent: true,
          opacity: 0.6,
          depthTest: false,
        })
        const brushMesh = new THREE.Mesh(brushGeom, brushMat)
        brushMesh.visible = false
        brushMesh.renderOrder = 998
        meshGroup.add(brushMesh)
        brushMeshRef.current = brushMesh
        brushGeomCleanupRef.current = () => {
          brushGeom.dispose()
          brushMat.dispose()
        }

        cleanupMesh = () => {
          for (const m of meshes) m.geometry.dispose()
          // EdgesGeometry children disposed via traverse.
          meshGroup.traverse((c) => {
            if ((c as THREE.LineSegments).geometry) {
              ;(c as THREE.LineSegments).geometry.dispose()
            }
          })
          dbgGeom.dispose()
          eyeDbgGeom.dispose()
        }
        setLoading(false)
      },
      undefined,
      (err) => setLoadError(String(err)),
    )

    // Resolve the active mesh from the satellite, then load it. Falls back
    // to the bundled default when the satellite is unreachable.
    void (async () => {
      let f = 'face-model.obj'
      try {
        const r = await fetch(apiUrl('/meshes/active'))
        if (r.ok) {
          const d = await r.json()
          if (d && typeof d.file === 'string' && d.file) f = d.file
        }
      } catch {
        /* satellite down -> bundled default */
      }
      _loadOnce(f)
    })()

    let raf = 0
    let last = performance.now()
    const wireColorCurrent = new THREE.Color(MODE_PROFILES.boot.wireColor)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const profile = MODE_PROFILES[modeRef.current]

      voiceSmooth.current += (targetVoice.current - voiceSmooth.current) * Math.min(1, dt * 14)
      targetVoice.current *= 0.92
      const voiceAmp = Math.min(1, voiceSmooth.current * 9)

      micSmooth.current += (targetMic.current - micSmooth.current) * Math.min(1, dt * 14)
      targetMic.current *= 0.92
      void Math.min(1, micSmooth.current * 9) // mic reserved

      // Boot — opacity + scale grow from 0 over 2s.
      let bootT = 1
      if (modeRef.current === 'boot') {
        const elapsed = (now - modeChangedAt.current) / 1000
        bootT = Math.min(1, elapsed / 2.0)
      }
      // Ease-out cubic for the assembly so it lands gracefully.
      const eased = 1 - Math.pow(1 - bootT, 3)
      fillMat.opacity = eased
      wireMat.opacity = eased
      root.scale.setScalar(eased * (1 + voiceAmp * profile.scalePulse))

      // Wireframe color lerp — feels less jarring than a hard swap on
      // mode change. 6x/sec gets it across in ~150ms.
      lerpColor(wireColorCurrent, profile.wireColor, Math.min(1, dt * 6))
      wireMat.color.copy(wireColorCurrent)

      // Lip-sync + eye-blink deform. Both share the same mesh position
      // attribute and one needsUpdate flag at the end. The wireframe is
      // a shared-position LineSegments (see OBJ load) so it warps along
      // with the fill automatically.
      const faceMesh = faceMeshRef.current
      let positionsDirty = false
      if (faceMesh) {
        const pos = faceMesh.geometry.attributes.position.array as Float32Array

        // ── Lip sync (amplitude-only, speaking mode) ────────────
        const lipIndices = lipIndicesRef.current
        const lipOriginal = lipOriginalRef.current
        if (lipIndices.length && lipOriginal) {
          const open = modeRef.current === 'speaking' ? voiceAmp : 0
          const cX = lipCentroidXRef.current
          const lowerDrop = open * 0.12
          const upperRise = open * -0.02
          for (let k = 0; k < lipIndices.length; k++) {
            const i = lipIndices[k]
            const oX = lipOriginal[k * 3]
            const offset = oX > cX ? lowerDrop : upperRise
            pos[i * 3] = oX + offset
            pos[i * 3 + 1] = lipOriginal[k * 3 + 1]
            pos[i * 3 + 2] = lipOriginal[k * 3 + 2]
          }
          positionsDirty = true
        }

        // ── Blink state machine + eye deform ───────────────────
        // Phases: wait → close (~150ms) → hold (~80ms closed) → open
        // (~150ms) → wait, with a randomized next-blink delay 2-6s.
        const blink = blinkRef.current
        blink.t += dt
        let blinkAmt = 0
        if (blink.phase === 'wait') {
          if (blink.t >= blink.next) {
            blink.phase = 'close'
            blink.t = 0
          }
        }
        if (blink.phase === 'close') {
          blinkAmt = Math.min(1, blink.t / 0.15)
          if (blink.t >= 0.15) {
            blink.phase = 'hold'
            blink.t = 0
          }
        } else if (blink.phase === 'hold') {
          blinkAmt = 1
          if (blink.t >= 0.08) {
            blink.phase = 'open'
            blink.t = 0
          }
        } else if (blink.phase === 'open') {
          blinkAmt = Math.max(0, 1 - blink.t / 0.15)
          if (blink.t >= 0.15) {
            blink.phase = 'wait'
            blink.t = 0
            blink.next = 2 + Math.random() * 4
          }
        }
        const eyeIndices = eyeIndicesRef.current
        const eyeOriginal = eyeOriginalRef.current
        if (eyeIndices.length && eyeOriginal) {
          const cX = eyeCentroidXRef.current
          const targetX = eyeLowerCentroidXRef.current
          // Push upper-lid verts forward along the face-direction
          // (raw +Y +Z) as they descend, so the closing lid passes
          // IN FRONT of the eyeball instead of cutting through it.
          const FY = 0.707 // ≈ sin(45°), face-direction y component
          const FZ = 0.707 // ≈ cos(45°), face-direction z component
          const FORWARD_PUSH = 0.04
          for (let k = 0; k < eyeIndices.length; k++) {
            const i = eyeIndices[k]
            const oX = eyeOriginal[k * 3]
            const oY = eyeOriginal[k * 3 + 1]
            const oZ = eyeOriginal[k * 3 + 2]
            // Upper lid (closer to crown = oX < cX) lerps toward the
            // lower-lid centroid X. Lower lid stays put.
            if (oX < cX) {
              pos[i * 3] = oX + (targetX - oX) * blinkAmt
              pos[i * 3 + 1] = oY + blinkAmt * FORWARD_PUSH * FY
              pos[i * 3 + 2] = oZ + blinkAmt * FORWARD_PUSH * FZ
            } else {
              pos[i * 3] = oX
              pos[i * 3 + 1] = oY
              pos[i * 3 + 2] = oZ
            }
          }
          positionsDirty = true
        }

        if (positionsDirty) {
          faceMesh.geometry.attributes.position.needsUpdate = true
        }
      }

      // OrbitControls owns the camera pose entirely — user-driven only.
      controls.update()

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    // ── Paint picker (right-click + drag) ─────────────────────
    // Raycast from the cursor into the scene; find the mesh hit point
    // (in the mesh's LOCAL coords, before mesh transforms — the geometry
    // attribute we care about); add every vertex within BRUSH_RADIUS of
    // that point to the lip set. Shift+right-click removes instead.
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let painting = false
    let paintRemove = false

    const screenToHit = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const face = faceMeshRef.current
      if (!face) return null
      const hits = raycaster.intersectObject(face, false)
      if (hits.length === 0) return null
      // Convert world-space hit to the face mesh's local coords (the
      // coord space the vertex positions live in).
      const local = hits[0].point.clone()
      face.worldToLocal(local)
      return local
    }

    const paintAt = (clientX: number, clientY: number) => {
      const hit = screenToHit(clientX, clientY)
      const brush = brushMeshRef.current
      if (!hit) {
        if (brush) brush.visible = false
        return
      }
      const face = faceMeshRef.current
      // Dispatch on which picker is active — lip set or eye set.
      const mode = pickerModeRef.current
      const refresh =
        mode === 'lips' ? refreshLipStateRef.current
        : mode === 'eyes' ? refreshEyeStateRef.current
        : null
      const currentIndices =
        mode === 'lips' ? lipIndicesRef.current
        : mode === 'eyes' ? eyeIndicesRef.current
        : null
      if (!face || !refresh || !currentIndices) return
      if (brush) {
        brush.position.copy(hit)
        brush.visible = true
        // Color the brush to match the active set so it's obvious which
        // set you're editing.
        ;(brush.material as THREE.MeshBasicMaterial).color.setHex(
          mode === 'eyes' ? 0x00ffff : 0xff00ff,
        )
      }
      const positions = face.geometry.attributes.position.array as Float32Array
      const r2 = BRUSH_RADIUS * BRUSH_RADIUS
      const current = new Set(currentIndices)
      let changed = false
      for (let i = 0; i < positions.length / 3; i++) {
        const dx = positions[i * 3] - hit.x
        const dy = positions[i * 3 + 1] - hit.y
        const dz = positions[i * 3 + 2] - hit.z
        if (dx * dx + dy * dy + dz * dz > r2) continue
        if (paintRemove) {
          if (current.delete(i)) changed = true
        } else {
          if (!current.has(i)) {
            current.add(i)
            changed = true
          }
        }
      }
      if (changed) refresh([...current].sort((a, b) => a - b))
    }

    const onPointerDown = (e: PointerEvent) => {
      // Right-click paints, but only when a picker is active.
      // Left-click always rotates (OrbitControls).
      if (e.button !== 2) return
      if (pickerModeRef.current === 'off') return
      painting = true
      paintRemove = e.shiftKey
      renderer.domElement.setPointerCapture?.(e.pointerId)
      paintAt(e.clientX, e.clientY)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!painting) {
        // Hide brush indicator when not actively painting.
        if (brushMeshRef.current) brushMeshRef.current.visible = false
        return
      }
      paintAt(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 2) return
      painting = false
      renderer.domElement.releasePointerCapture?.(e.pointerId)
      if (brushMeshRef.current) brushMeshRef.current.visible = false
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('contextmenu', onContextMenu)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      controls.dispose()
      cleanupMesh?.()
      brushGeomCleanupRef.current?.()
      wireMat.dispose()
      fillMat.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  // ── Toolbar actions ──────────────────────────────────────────────
  /** Clear the currently-active picker's set. */
  const clearActive = () => {
    if (pickerMode === 'lips') refreshLipStateRef.current?.([])
    else if (pickerMode === 'eyes') refreshEyeStateRef.current?.([])
  }
  /** Log BOTH sets to the console; copy the active one to clipboard. */
  const saveActive = () => {
    const lips = lipIndicesRef.current
    const eyes = eyeIndicesRef.current
    console.log(`[head] lip indices (${lips.length}):`, JSON.stringify(lips))
    console.log(`[head] eye indices (${eyes.length}):`, JSON.stringify(eyes))
    const indices = pickerMode === 'eyes' ? eyes : lips
    try {
      navigator.clipboard.writeText(JSON.stringify(indices))
    } catch {
      /* */
    }
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  return (
    <Paper
      ref={containerRef}
      sx={{
        p: 0,
        bgcolor: '#04060e',
        borderRadius: isFullscreen ? 0 : 2,
        overflow: 'hidden',
        position: 'relative',
        height: isFullscreen ? '100vh' : 'auto',
      }}
    >
      <Box
        ref={mountRef}
        sx={{
          width: '100%',
          height: isFullscreen
            ? '100vh'
            : { xs: 'calc(100dvh - 200px)', md: 'calc(100dvh - 120px)' },
          '& canvas': { display: 'block', touchAction: 'none' },
        }}
      />
      {loading && !loadError && (
        <Stack
          sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <CircularProgress size={32} sx={{ color: '#7dd3fc' }} />
        </Stack>
      )}
      {loadError && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fca5a5',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 13,
          }}
        >
          failed to load /face-model.obj — {loadError}
        </Box>
      )}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          bgcolor: 'rgba(4, 6, 14, 0.55)',
          backdropFilter: 'blur(6px)',
          borderRadius: 1,
          p: 0.25,
          opacity: 0,
          transition: 'opacity 180ms ease',
          '&:hover': { opacity: 1 },
        }}
      >
        <IconBtn
          label={
            pickerMode === 'lips'
              ? 'Lip picker ON — right-click + drag paints lips (shift to erase). Click again to exit.'
              : 'Lip picker OFF — click to enter lip paint mode'
          }
          onClick={() => setPickerMode((m) => (m === 'lips' ? 'off' : 'lips'))}
          sx={{ color: pickerMode === 'lips' ? '#ff66cc' : '#cfd6e6' }}
          icon={<BrushIcon />}
        />
        <IconBtn
          label={
            pickerMode === 'eyes'
              ? 'Eye picker ON — right-click + drag paints eyes (shift to erase). Click again to exit.'
              : 'Eye picker OFF — click to enter eye paint mode'
          }
          onClick={() => setPickerMode((m) => (m === 'eyes' ? 'off' : 'eyes'))}
          sx={{ color: pickerMode === 'eyes' ? '#66ffff' : '#cfd6e6' }}
          icon={<RemoveRedEyeIcon />}
        />
        <IconBtn
          label={`Clear the active picker's verts (${pickerMode === 'off' ? 'no picker active' : pickerMode})`}
          onClick={clearActive}
          disabled={pickerMode === 'off'}
          sx={{ color: '#cfd6e6' }}
          icon={<DeleteIcon />}
        />
        <IconBtn
          label="Save — logs both sets to console, copies the active one to clipboard"
          onClick={saveActive}
          sx={{ color: '#cfd6e6' }}
          icon={<SaveIcon />}
        />
        <IconBtn
          label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={toggleFullscreen}
          sx={{ color: '#cfd6e6' }}
          icon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        />
      </Stack>
    </Paper>
  )
}
