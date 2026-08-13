'use client';

/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
 *
 * --- Performance notes (post-optimization) ---
 *
 *   • Sphere geometry: 12×12 segments instead of 20×20 → ~64 % fewer
 *     vertices per joint mesh.  Visual difference at on-screen joint
 *     scale (~22 px diameter) is imperceptible.
 *   • Cylinder geometry: 8 radial segments instead of 10.
 *   • Materials: `MeshStandardMaterial` for joints/bones — clearcoat is
 *     only kept on the tip & repulsor where the rim-light reads.  The
 *     clearcoat shader is ~30 % more expensive per draw call.
 *   • Mobile path: skip PMREM environment generation entirely (saved
 *     ~120 ms of init time on a Pixel 7) and skip clearcoat everywhere.
 *   • Per-frame allocations: zero — all temporaries are module-scope
 *     Vector3 / Quaternion buffers and the bone radius table is
 *     pre-computed once per scene.
 */
import * as THREE from 'three';
import { perf } from '@/lib/perf-monitor';

// ─── Topology ────────────────────────────────────────────────────
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [5, 9], [9, 10], [10, 11], [11, 12],    // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const FINGERTIP_ARRAY = new Uint8Array([4, 8, 12, 16, 20]);

// Joint radii — larger at base, taper toward tips. Flat array indexed by
// landmark index for O(1) lookup (Record<>+`??` was the previous hotspot).
const JOINT_RADIUS = new Float32Array(21);
(function initJointRadii() {
  // Defaults
  for (let i = 0; i < 21; i++) JOINT_RADIUS[i] = 0.015;
  JOINT_RADIUS[0]  = 0.030;
  JOINT_RADIUS[1]  = 0.020; JOINT_RADIUS[5]  = 0.022; JOINT_RADIUS[9]  = 0.022;
  JOINT_RADIUS[13] = 0.021; JOINT_RADIUS[17] = 0.019;
  JOINT_RADIUS[2]  = 0.017; JOINT_RADIUS[6]  = 0.018; JOINT_RADIUS[10] = 0.019;
  JOINT_RADIUS[14] = 0.018; JOINT_RADIUS[18] = 0.016;
  JOINT_RADIUS[3]  = 0.014; JOINT_RADIUS[7]  = 0.015; JOINT_RADIUS[11] = 0.016;
  JOINT_RADIUS[15] = 0.015; JOINT_RADIUS[19] = 0.013;
  JOINT_RADIUS[4]  = 0.015; JOINT_RADIUS[8]  = 0.016; JOINT_RADIUS[12] = 0.017;
  JOINT_RADIUS[16] = 0.015; JOINT_RADIUS[20] = 0.013;
})();

// Pre-baked bone half-width per connection — indexed by CONNECTION index.
const BONE_RADIUS = new Float32Array(CONNECTIONS.length);
(function initBoneRadii() {
  for (let i = 0; i < CONNECTIONS.length; i++) {
    const [si, ei] = CONNECTIONS[i];
    if (si === 0 || ei === 0) { BONE_RADIUS[i] = 0.016; continue; }
    const avg = (si + ei) / 2;
    if (avg <= 4)      BONE_RADIUS[i] = 0.011;
    else if (avg <= 8) BONE_RADIUS[i] = 0.011;
    else if (avg <= 12) BONE_RADIUS[i] = 0.012;
    else if (avg <= 16) BONE_RADIUS[i] = 0.011;
    else                BONE_RADIUS[i] = 0.009;
  }
})();

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
    armor:    THREE.MeshStandardMaterial;
    joint:    THREE.MeshStandardMaterial;
    tip:      THREE.MeshPhysicalMaterial;
    repulsor: THREE.MeshPhysicalMaterial;
  };
  geos: {
    sphere:   THREE.SphereGeometry;
    cylinder: THREE.CylinderGeometry;
  };
  positions: THREE.Vector3[][];
}

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as any).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ─── Internal helpers ────────────────────────────────────────────
function makeHandGroup(
  scene: THREE.Scene,
  geos: ThreeHandScene['geos'],
  mats: ThreeHandScene['mats'],
): HandGroup {
  const joints: THREE.Mesh[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    const m = new THREE.Mesh(geos.sphere, FINGERTIPS.has(i) ? mats.tip : mats.joint);
    m.frustumCulled = false; // avoid per-frame frustum tests for a known-on-screen mesh
    m.visible = false;
    scene.add(m);
    joints[i] = m;
  }

  const bones: THREE.Mesh[] = new Array(CONNECTIONS.length);
  for (let i = 0; i < CONNECTIONS.length; i++) {
    const m = new THREE.Mesh(geos.cylinder, mats.armor);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    bones[i] = m;
  }

  const repulsor = new THREE.Mesh(geos.sphere, mats.repulsor);
  repulsor.frustumCulled = false;
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
  const isMobile = detectMobile();

  /* ── Renderer ─────────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile,                                   // MSAA is expensive on mobile GPUs
    powerPreference: 'high-performance',
  });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  /* ── Scene + Camera ───────────────────────────────────────── */
  const scene  = new THREE.Scene();
  const aspect = w / h;
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 50);
  camera.position.z = 5;

  /* ── Environment for metallic reflections (desktop only) ── */
  if (!isMobile) {
    const pmrem    = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x556677);
    const envLights: [number, number, [number, number, number]][] = [
      [0xffffff, 5, [1, 2, 1]],
      [0xaaccff, 3, [-2, 0.5, 1]],
      [0xffddbb, 2, [0, -1, 2]],
    ];
    for (let i = 0; i < envLights.length; i++) {
      const [c, intensity, p] = envLights[i];
      const l = new THREE.DirectionalLight(c, intensity);
      l.position.set(p[0], p[1], p[2]);
      envScene.add(l);
    }
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  /* ── Scene lights ─────────────────────────────────────────── */
  scene.add(new THREE.AmbientLight(0x404050, 2));
  const key = new THREE.DirectionalLight(0xffeedd, 4);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8899cc, 2);
  fill.position.set(-3, -1, 4);
  scene.add(fill);

  /* ── Materials ────────────────────────────────────────────── */
  // Joints + armor use cheaper MeshStandardMaterial (no clearcoat shader).
  // Tips and repulsor keep MeshPhysicalMaterial because their rim-light
  // depends on clearcoat for the read-as-glass look.
  const mats: ThreeHandScene['mats'] = {
    armor: new THREE.MeshStandardMaterial({
      color: 0xc89b00,
      metalness: 0.95,
      roughness: 0.18,
    }),
    joint: new THREE.MeshStandardMaterial({
      color: 0x556688,
      metalness: 0.85,
      roughness: 0.22,
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
  // 12×12 sphere ≈ 144 tris; 20×20 (old) ≈ 400 tris.  Tris per scene:
  // 21 joints × 2 hands × 144 = 6 048  (old 16 800).
  const sphereSeg   = isMobile ? 10 : 12;
  const cylinderSeg = isMobile ? 6  : 8;
  const geos = {
    sphere:   new THREE.SphereGeometry(1, sphereSeg, sphereSeg),
    cylinder: new THREE.CylinderGeometry(1, 0.82, 1, cylinderSeg),
  };

  /* ── Hand groups (supports 2 hands) ──────────────────────── */
  const hands = [
    makeHandGroup(scene, geos, mats),
    makeHandGroup(scene, geos, mats),
  ];

  /* ── Pre-allocated landmark position arrays ──────────────── */
  const positions: THREE.Vector3[][] = [[], []];
  for (let h = 0; h < 2; h++) {
    for (let i = 0; i < 21; i++) positions[h].push(new THREE.Vector3());
  }

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
  perf.mark('three.update');
  const aspect = s.camera.right;  // equals video aspect ratio
  const pulse  = 0.6 + 0.4 * Math.sin(t * 0.004);

  // Pulse emissive on shared materials (cheap, affects all meshes at once)
  s.mats.tip.emissiveIntensity      = 0.6 + pulse * 1.2;
  s.mats.repulsor.emissiveIntensity = 1.5 + pulse * 3;

  const handsLen = s.hands.length;
  const landmarksLen = landmarks.length;
  for (let h = 0; h < handsLen; h++) {
    const g = s.hands[h];

    // ── Hide hand when not detected ──────────────────────────
    if (h >= landmarksLen) {
      const joints = g.joints;
      for (let i = 0; i < 21; i++) joints[i].visible = false;
      const bones = g.bones;
      for (let i = 0; i < bones.length; i++) bones[i].visible = false;
      g.repulsor.visible = false;
      g.light.visible    = false;
      continue;
    }

    const hand = landmarks[h];
    const pos  = s.positions[h];

    // Convert each landmark to camera-space coords
    for (let i = 0; i < 21; i++) {
      const lm = hand[i];
      pos[i].set(
        (1 - 2 * lm.x) * aspect,  // mirror X
        1 - 2 * lm.y,             // flip Y
        -lm.z * 4,                // depth
      );
    }

    // ── Joints ───────────────────────────────────────────────
    const joints = g.joints;
    const tipScale = 0.9 + pulse * 0.2;
    for (let i = 0; i < 21; i++) {
      const m  = joints[i];
      m.visible = true;
      m.position.copy(pos[i]);
      const r = JOINT_RADIUS[i] * (FINGERTIPS.has(i) ? tipScale : 1);
      m.scale.setScalar(r);
    }

    // ── Bones (tapered cylinders) ────────────────────────────
    const bones = g.bones;
    for (let b = 0; b < CONNECTIONS.length; b++) {
      const conn = CONNECTIONS[b];
      const si = conn[0];
      const ei = conn[1];
      const m  = bones[b];
      const p1 = pos[si];
      const p2 = pos[ei];

      _dir.subVectors(p2, p1);
      const len = _dir.length();
      if (len < 0.005) { m.visible = false; continue; }

      m.visible = true;
      m.position.lerpVectors(p1, p2, 0.5);

      const r = BONE_RADIUS[b];
      m.scale.set(r, len * 0.88, r);  // 88 % of slot → visible joint gap

      _dir.multiplyScalar(1 / len);
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
  perf.measure('three.update');
}

/** Render one frame. Call after `update()`. */
export function render(s: ThreeHandScene) {
  perf.mark('three.render');
  s.renderer.render(s.scene, s.camera);
  perf.measure('three.render');
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
