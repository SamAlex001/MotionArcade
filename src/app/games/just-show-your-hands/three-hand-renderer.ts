'use client';
/**
 * Three.js Iron-Man / Gauntlet hand renderer.
 *
 * Uses procedural geometry (spheres + tapered cylinders) positioned at
 * MediaPipe hand landmarks, with PBR metallic materials, environment
 * reflections, clearcoat, proper lighting, and palm repulsor effects.
 *
 * Exported API is intentionally imperative so the React component can
 * call `createScene` once and `update` + `render` every frame without
 * re-creating objects.
 */
import * as THREE from 'three';

// ─── Topology ────────────────────────────────────────────────────
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [5, 9], [9, 10], [10, 11], [11, 12],    // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

// Joint radii — larger at base, taper toward tips
const JOINT_RADIUS: Record<number, number> = {
  0: 0.030,
  1: 0.020, 5: 0.022, 9: 0.022, 13: 0.021, 17: 0.019,   // MCP
  2: 0.017, 6: 0.018, 10: 0.019, 14: 0.018, 18: 0.016,   // PIP
  3: 0.014, 7: 0.015, 11: 0.016, 15: 0.015, 19: 0.013,   // DIP
  4: 0.015, 8: 0.016, 12: 0.017, 16: 0.015, 20: 0.013,   // TIP
};

// Bone half-width per region
function boneRadius(si: number, ei: number): number {
  if (si === 0 || ei === 0) return 0.016;  // wrist connections (thicker)
  const avg = (si + ei) / 2;
  if (avg <= 4) return 0.011;   // thumb
  if (avg <= 8) return 0.011;   // index
  if (avg <= 12) return 0.012;  // middle
  if (avg <= 16) return 0.011;  // ring
  return 0.009;                 // pinky
}

// ─── Reusable temp objects (avoid per-frame allocation) ──────────
const _up  = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q   = new THREE.Quaternion();
const _pc  = new THREE.Vector3();

// ─── Types ───────────────────────────────────────────────────────
interface HandGroup {
  joints:  THREE.Mesh[];
  bones:   THREE.Mesh[];
  repulsor: THREE.Mesh;
  light:   THREE.PointLight;
}

export interface ThreeHandScene {
  renderer: THREE.WebGLRenderer;
  scene:    THREE.Scene;
  camera:   THREE.OrthographicCamera;
  hands:    HandGroup[];
  mats: {
    armor:    THREE.MeshPhysicalMaterial;
    joint:    THREE.MeshPhysicalMaterial;
    tip:      THREE.MeshPhysicalMaterial;
    repulsor: THREE.MeshPhysicalMaterial;
  };
  geos: {
    sphere:   THREE.SphereGeometry;
    cylinder: THREE.CylinderGeometry;
  };
  /** Pre-allocated position arrays: [handIdx][landmarkIdx] */
  positions: THREE.Vector3[][];
}

// ─── Internal helpers ────────────────────────────────────────────
function makeHandGroup(
  scene: THREE.Scene,
  geos: ThreeHandScene['geos'],
  mats: ThreeHandScene['mats'],
): HandGroup {
  const joints = Array.from({ length: 21 }, (_, i) => {
    const m = new THREE.Mesh(geos.sphere, FINGERTIPS.has(i) ? mats.tip : mats.joint);
    m.visible = false;
    scene.add(m);
    return m;
  });

  const bones = CONNECTIONS.map(() => {
    const m = new THREE.Mesh(geos.cylinder, mats.armor);
    m.visible = false;
    scene.add(m);
    return m;
  });

  const repulsor = new THREE.Mesh(geos.sphere, mats.repulsor);
  repulsor.visible = false;
  scene.add(repulsor);

  const light = new THREE.PointLight(0x44aaff, 0, 3);
  light.visible = false;
  scene.add(light);

  return { joints, bones, repulsor, light };
}

// ─── Public API ──────────────────────────────────────────────────

export function createScene(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): ThreeHandScene {
  /* ── Renderer ─────────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  /* ── Scene + Camera ───────────────────────────────────────── */
  const scene  = new THREE.Scene();
  const aspect = w / h;
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 50);
  camera.position.z = 5;

  /* ── Environment for metallic reflections (procedural) ───── */
  const pmrem    = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x556677);
  [
    { c: 0xffffff, i: 5, p: [1, 2, 1] },
    { c: 0xaaccff, i: 3, p: [-2, 0.5, 1] },
    { c: 0xffddbb, i: 2, p: [0, -1, 2] },
  ].forEach(({ c, i, p }) => {
    const l = new THREE.DirectionalLight(c, i);
    l.position.set(p[0], p[1], p[2]);
    envScene.add(l);
  });
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  /* ── Scene lights ─────────────────────────────────────────── */
  scene.add(new THREE.AmbientLight(0x404050, 2));
  const key = new THREE.DirectionalLight(0xffeedd, 4);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8899cc, 2);
  fill.position.set(-3, -1, 4);
  scene.add(fill);

  /* ── Materials ────────────────────────────────────────────── */
  const mats = {
    armor: new THREE.MeshPhysicalMaterial({
      color: 0xc89b00,       // Gold
      metalness: 0.95,
      roughness: 0.10,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
    joint: new THREE.MeshPhysicalMaterial({
      color: 0x556688,
      metalness: 0.85,
      roughness: 0.20,
      emissive: 0x223355,
      emissiveIntensity: 0.4,
    }),
    tip: new THREE.MeshPhysicalMaterial({
      color: 0x55bbff,
      metalness: 0.70,
      roughness: 0.15,
      emissive: 0x2288cc,
      emissiveIntensity: 1.0,
    }),
    repulsor: new THREE.MeshPhysicalMaterial({
      color: 0xaaeeff,
      metalness: 0.30,
      roughness: 0.10,
      emissive: 0x55ccff,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0.85,
    }),
  };

  /* ── Geometry (shared across all meshes) ──────────────────── */
  const geos = {
    sphere:   new THREE.SphereGeometry(1, 20, 20),
    cylinder: new THREE.CylinderGeometry(1, 0.82, 1, 10), // tapered
  };

  /* ── Hand groups (supports 2 hands) ──────────────────────── */
  const hands = [
    makeHandGroup(scene, geos, mats),
    makeHandGroup(scene, geos, mats),
  ];

  /* ── Pre-allocated landmark position arrays ──────────────── */
  const positions = [
    Array.from({ length: 21 }, () => new THREE.Vector3()),
    Array.from({ length: 21 }, () => new THREE.Vector3()),
  ];

  return { renderer, scene, camera, hands, mats, geos, positions };
}

/**
 * Convert MediaPipe landmarks into Three.js coords and update every mesh.
 * Call once per frame before `render()`.
 */
export function update(
  s: ThreeHandScene,
  landmarks: { x: number; y: number; z: number }[][],
  t: number,
) {
  const aspect = s.camera.right;  // equals video aspect ratio
  const pulse  = 0.6 + 0.4 * Math.sin(t * 0.004);

  // Pulse emissive on shared materials (cheap, affects all meshes at once)
  s.mats.tip.emissiveIntensity      = 0.6 + pulse * 1.2;
  s.mats.repulsor.emissiveIntensity = 1.5 + pulse * 3;

  for (let h = 0; h < s.hands.length; h++) {
    const g = s.hands[h];

    // ── Hide hand when not detected ──────────────────────────
    if (h >= landmarks.length) {
      g.joints.forEach(m  => (m.visible = false));
      g.bones.forEach(m   => (m.visible = false));
      g.repulsor.visible = false;
      g.light.visible    = false;
      continue;
    }

    const hand = landmarks[h];
    const pos  = s.positions[h];

    // Convert each landmark to camera-space coords
    for (let i = 0; i < 21; i++) {
      pos[i].set(
        (1 - 2 * hand[i].x) * aspect,  // mirror X
        1 - 2 * hand[i].y,             // flip Y
        -hand[i].z * 4,                // depth
      );
    }

    // ── Joints ───────────────────────────────────────────────
    for (let i = 0; i < 21; i++) {
      const m  = g.joints[i];
      m.visible = true;
      m.position.copy(pos[i]);
      const r = (JOINT_RADIUS[i] ?? 0.015)
        * (FINGERTIPS.has(i) ? 0.9 + pulse * 0.2 : 1);
      m.scale.setScalar(r);
    }

    // ── Bones (tapered cylinders) ────────────────────────────
    for (let b = 0; b < CONNECTIONS.length; b++) {
      const [si, ei] = CONNECTIONS[b];
      const m  = g.bones[b];
      const p1 = pos[si];
      const p2 = pos[ei];

      _dir.subVectors(p2, p1);
      const len = _dir.length();
      if (len < 0.005) { m.visible = false; continue; }

      m.visible = true;
      m.position.lerpVectors(p1, p2, 0.5);

      const r = boneRadius(si, ei);
      m.scale.set(r, len * 0.88, r);  // 88 % of slot → visible joint gap

      _dir.normalize();
      _q.setFromUnitVectors(_up, _dir);
      m.quaternion.copy(_q);
    }

    // ── Palm repulsor ────────────────────────────────────────
    _pc.set(0, 0, 0)
      .add(pos[0]).add(pos[5]).add(pos[9]).add(pos[13]).add(pos[17])
      .multiplyScalar(0.2);
    _pc.z += 0.02;

    g.repulsor.visible = true;
    g.repulsor.position.copy(_pc);
    g.repulsor.scale.setScalar(0.022 * pulse);

    g.light.visible = true;
    g.light.position.copy(_pc);
    g.light.position.z += 0.1;
    g.light.intensity = 5 * pulse;
  }
}

/** Render one frame. Call after `update()`. */
export function render(s: ThreeHandScene) {
  s.renderer.render(s.scene, s.camera);
}

/** Resize the renderer + camera to match a new canvas size. */
export function resize(s: ThreeHandScene, w: number, h: number) {
  const a = w / h;
  s.camera.left  = -a;
  s.camera.right =  a;
  s.camera.updateProjectionMatrix();
  s.renderer.setSize(w, h, false);
}

/** Tear down all GPU resources. */
export function dispose(s: ThreeHandScene) {
  s.geos.sphere.dispose();
  s.geos.cylinder.dispose();
  Object.values(s.mats).forEach(m => m.dispose());

  for (const g of s.hands) {
    g.joints.forEach(m => s.scene.remove(m));
    g.bones.forEach(m  => s.scene.remove(m));
    s.scene.remove(g.repulsor);
    s.scene.remove(g.light);
  }

  s.scene.environment?.dispose();
  s.renderer.dispose();
}
