import * as THREE from 'three';
import { POSE_CONNECTIONS, POSE_KEY_JOINTS } from '@/lib/pose-connections';
import { perf } from '@/lib/perf-monitor';

const CONNECTIONS: Array<[number, number, number]> = [];
for (const [a, b] of POSE_CONNECTIONS) {
  CONNECTIONS.push([a, b, (a >= 23 || b >= 23) ? 0.05 : (a >= 11 && a <= 22) || (b >= 11 && b <= 22) ? 0.03 : 0.024]);
}

const JOINT_RADIUS = new Float32Array(33);
function setJointRad(idxs: number[], r: number) { for (const i of idxs) JOINT_RADIUS[i] = r; }
setJointRad([11, 12, 23, 24], 0.042);
setJointRad([13, 14, 25, 26], 0.036);
setJointRad([15, 16, 27, 28], 0.032);
setJointRad([17, 18, 21, 22, 19, 20], 0.02);
setJointRad([29, 30, 31, 32], 0.024);
setJointRad([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.016);
JOINT_RADIUS[0] = 0.03;

const BONE_RADIUS: number[] = CONNECTIONS.map(c => c[2]);

const _dir = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

interface BodyGroup {
  joints: THREE.Mesh[];
  bones: THREE.Mesh[];
  head: THREE.Mesh;
  chestLight: THREE.PointLight;
}

export interface ThreeBodyScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  body: BodyGroup;
  mats: { armor: THREE.MeshStandardMaterial; joint: THREE.MeshStandardMaterial; accent: THREE.MeshPhysicalMaterial };
  geos: { sphere: THREE.SphereGeometry; cylinder: THREE.CylinderGeometry };
  positions: THREE.Vector3[];
}

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as any).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function makeBodyGroup(scene: THREE.Scene, geos: ThreeBodyScene['geos'], mats: ThreeBodyScene['mats']): BodyGroup {
  const joints: THREE.Mesh[] = new Array(33);
  for (let i = 0; i < 33; i++) {
    const m = new THREE.Mesh(geos.sphere, POSE_KEY_JOINTS.has(i) ? mats.accent : mats.joint);
    m.frustumCulled = false; m.visible = false;
    scene.add(m);
    joints[i] = m;
  }
  const bones: THREE.Mesh[] = new Array(CONNECTIONS.length);
  for (let i = 0; i < CONNECTIONS.length; i++) {
    const m = new THREE.Mesh(geos.cylinder, mats.armor);
    m.frustumCulled = false; m.visible = false;
    scene.add(m);
    bones[i] = m;
  }
  const head = new THREE.Mesh(geos.sphere, mats.accent);
  head.frustumCulled = false; head.visible = false;
  scene.add(head);
  const chestLight = new THREE.PointLight(0x7dc9ff, 0, 4);
  chestLight.visible = false;
  scene.add(chestLight);
  return { joints, bones, head, chestLight };
}

export function createScene(canvas: HTMLCanvasElement, w: number, h: number): ThreeBodyScene {
  const isMobile = detectMobile();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  const scene = new THREE.Scene();
  const aspect = w / h;
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 50);
  camera.position.z = 5;

  if (!isMobile) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.AmbientLight(0xffffff, 2));
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  const geos = {
    sphere: new THREE.SphereGeometry(1, isMobile ? 10 : 12, isMobile ? 10 : 12),
    cylinder: new THREE.CylinderGeometry(1, 0.82, 1, isMobile ? 6 : 8),
  };
  const mats = {
    armor: new THREE.MeshStandardMaterial({ color: 0x0e2a4a, metalness: 0.9, roughness: 0.32, emissive: 0x051018, emissiveIntensity: 0.4 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x19c4ff, metalness: 0.4, roughness: 0.2, emissive: 0x0a4a66, emissiveIntensity: 1.0 }),
    accent: new THREE.MeshPhysicalMaterial({ color: 0x22ddff, metalness: 0.1, roughness: 0.05, clearcoat: isMobile ? 0 : 1, clearcoatRoughness: 0.05, emissive: 0x0a3d55, emissiveIntensity: 1.4 }),
  };
  const body = makeBodyGroup(scene, geos, mats);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x36c2ff, 1.0); rim.position.set(-3, 1, -2); scene.add(rim);

  const positions: THREE.Vector3[] = new Array(33);
  for (let i = 0; i < 33; i++) positions[i] = new THREE.Vector3();

  return { renderer, scene, camera, body, mats, geos, positions };
}

export function update(s: ThreeBodyScene, landmarks: any[], pulse: number) {
  perf.mark('three.update');
  const g = s.body;
  const pose = landmarks && landmarks[0];

  if (!pose || pose.length < 33) {
    for (let i = 0; i < g.joints.length; i++) g.joints[i].visible = false;
    for (let i = 0; i < g.bones.length; i++) g.bones[i].visible = false;
    g.head.visible = false;
    g.chestLight.visible = false;
    perf.measure('three.update');
    return;
  }
  const a = s.camera.right;
  const pos = s.positions;

  for (let i = 0; i < 33; i++) {
    const lm = pose[i];
    pos[i].set((1 - 2 * lm.x) * a, 1 - 2 * lm.y, -(lm.z || 0) * 3);
  }

  const accentScale = 0.9 + pulse * 0.25;
  for (let i = 0; i < 33; i++) {
    const m = g.joints[i];
    m.visible = true;
    m.position.copy(pos[i]);
    m.scale.setScalar(JOINT_RADIUS[i] * (POSE_KEY_JOINTS.has(i) ? accentScale : 1));
  }

  for (let b = 0; b < CONNECTIONS.length; b++) {
    const conn = CONNECTIONS[b];
    const p1 = pos[conn[0]];
    const p2 = pos[conn[1]];
    _dir.subVectors(p2, p1);
    const len = _dir.length();
    if (len < 0.005) { g.bones[b].visible = false; continue; }
    const m = g.bones[b];
    m.visible = true;
    m.position.lerpVectors(p1, p2, 0.5);
    const r = BONE_RADIUS[b];
    m.scale.set(r, len * 0.9, r);
    _dir.multiplyScalar(1 / len);
    _q.setFromUnitVectors(_up, _dir);
    m.quaternion.copy(_q);
  }

  _pc.copy(pos[7]).add(pos[8]).multiplyScalar(0.5);
  const headW = Math.max(0.05, pos[7].distanceTo(pos[8]));
  g.head.visible = true;
  g.head.position.copy(_pc);
  g.head.position.z = -(pose[0].z || 0) * 3;
  g.head.scale.setScalar(headW * (0.62 + pulse * 0.12));

  _pc.copy(pos[11]).add(pos[12]).multiplyScalar(0.5);
  g.chestLight.visible = true;
  g.chestLight.position.copy(_pc);
  g.chestLight.position.z += 0.15;
  g.chestLight.intensity = 4 * pulse;

  perf.measure('three.update');
}

export function render(s: ThreeBodyScene) {
  perf.mark('three.render');
  s.renderer.render(s.scene, s.camera);
  perf.measure('three.render');
}

export function resize(s: ThreeBodyScene, w: number, h: number) {
  const a = w / h;
  s.camera.left = -a;
  s.camera.right = a;
  s.camera.updateProjectionMatrix();
  s.renderer.setSize(w, h, false);
}

export function dispose(s: ThreeBodyScene) {
  s.geos.sphere.dispose();
  s.geos.cylinder.dispose();
  Object.values(s.mats).forEach((m) => m.dispose());
  const g = s.body;
  g.joints.forEach((m) => s.scene.remove(m));
  g.bones.forEach((m) => s.scene.remove(m));
  s.scene.remove(g.head);
  s.scene.remove(g.chestLight);
  s.scene.environment?.dispose();
  s.renderer.dispose();
}