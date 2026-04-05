import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader }    from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader }   from "three/addons/loaders/DRACOLoader.js";
import { RGBELoader }    from "three/addons/loaders/RGBELoader.js";

// ── API ────────────────────────────────────────────────────────────────────
const API_STATE_URL  = "/api/state";
const API_STREAM_URL = "/api/stream";

// ── DOM ────────────────────────────────────────────────────────────────────
const canvas               = document.querySelector("#scene");
const apiStatusEl          = document.querySelector("#api-status");
const hudModeLabelEl       = document.querySelector("#hud-mode-label");
const vehicleLabelEl       = document.querySelector("#vehicle-label");
const telemetryLineEl      = document.querySelector("#telemetry-line");
const lightingLineEl       = document.querySelector("#lighting-line");
const dumpLineEl           = document.querySelector("#dump-line");
const speedLineEl          = document.querySelector("#speed-line");
const versionLineEl        = document.querySelector("#version-line");
const brakeToggleButton    = document.querySelector("#brake-toggle");
const headlightToggleButton= document.querySelector("#headlight-toggle");
const engineToggleButton   = document.querySelector("#engine-toggle");
const driveToggleButton    = document.querySelector("#drive-toggle");
const spoilerToggleButton  = document.querySelector("#spoiler-toggle");
const hornButton           = document.querySelector("#horn-button");
const nosButton            = document.querySelector("#nos-button");
const dumpTiltInput        = document.querySelector("#dump-tilt");
const dumpTiltValueEl      = document.querySelector("#dump-tilt-value");
const colorInput           = document.querySelector("#color-input");
const hudModeSelect        = document.querySelector("#hud-mode");
const apiExampleEl         = document.querySelector("#api-example");
const copyCommandButton    = document.querySelector("#copy-command");
const cameraButtons        = Array.from(document.querySelectorAll("[data-camera]"));
const loadingOverlay       = document.querySelector("#loading-overlay");

// ── App state (mirrors server) ─────────────────────────────────────────────
const state = {
  brakeLights:  false,
  headlights:   false,
  bodyColor:    "#c0392b",
  hudMode:      "tracking",
  vehicleLabel: "Autonomous Concept Vehicle",
  dumpBedTilt:  50,
  engineOn:     false,
  driving:      false,
  spoilerUp:    false,
  version:      0,
};

// ── Renderer ───────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

// ── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color("#040913");
scene.fog = new THREE.FogExp2("#040913", 0.016);

// ── Camera ─────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 200);

const PRESETS = {
  hero:     { pos: new THREE.Vector3(4.25,  1.40,  -4.50), target: new THREE.Vector3(0, 0.5, 0) },
  side:     { pos: new THREE.Vector3(7.50,  1.30,   0.00), target: new THREE.Vector3(0, 0.5, 0) },
  rear:     { pos: new THREE.Vector3(-5.50, 1.40,   4.50), target: new THREE.Vector3(0, 0.5, 0) },
  interior: { pos: new THREE.Vector3(-0.32, 0.82,   0.12), target: new THREE.Vector3(-0.28, 0.60, -2.2) },
};
camera.position.copy(PRESETS.hero.pos);

// ── OrbitControls ──────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.06;
controls.minDistance    = 1.8;
controls.maxDistance    = 28;
controls.target.copy(PRESETS.hero.target);
controls.minPolarAngle  = 0.06;
controls.maxPolarAngle  = Math.PI * 0.70;
controls.enablePan      = false;

// ── Clock + motion ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const camMotion = {
  from: camera.position.clone(), to: camera.position.clone(),
  tgtFrom: controls.target.clone(), tgtTo: controls.target.clone(),
  t: 1, isInterior: false,
};

// ── Drive simulation ───────────────────────────────────────────────────────
const DRIVE_RADIUS    = 7.2;
const DRIVE_SPEED_BASE= 0.75;   // rad/s
let   driveAngle      = 0;
let   currentSpeed    = 0;      // smoothed speed multiplier (0–1 normal, up to 3 with NOS)
let   nosActive       = false;
let   nosTimer        = 0;

// ── Spoiler animation ──────────────────────────────────────────────────────
let spoilerCurrentY = 0.52;
let spoilerTargetY  = 0.52;
const SPOILER_RETRACTED = 0.52;
const SPOILER_DEPLOYED  = 0.80;

// ── Scene parts ────────────────────────────────────────────────────────────
const parts = {
  carScene:         null,   // full gltf.scene (moved during drive mode)
  bodyMaterial:     null,
  brakeMeshes:      [],
  brakeLights:      [],
  headMeshes:       [],
  headLights:       [],
  headBeams:        [],
  wheels:           [],
  frontWheelGroups: [],
  scanRings:        [],
  spoilerGroup:     null,
};

// ── Lights ─────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0x8ab4f8, 0x2a1e0e, 0.6));

const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(5, 10, -6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: 0.5, far: 40, left: -8, right: 8, top: 8, bottom: -8 });
key.shadow.bias = -0.0003;
scene.add(key);

const fill = new THREE.DirectionalLight(0x67f0ff, 1.1);
fill.position.set(-7, 4, 5);
scene.add(fill);

const rimLight = new THREE.DirectionalLight(0xffeebb, 0.7);
rimLight.position.set(0, 3, 10);
scene.add(rimLight);

const underGlow = new THREE.PointLight(0x44ddff, 4, 5, 2);
underGlow.position.set(0, 0.2, 0);
scene.add(underGlow);

// ── Web Audio ──────────────────────────────────────────────────────────────
let audioCtx     = null;
let engineNodes  = null;   // { osc1, osc2, filter, gain }

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function makeCurve(n = 256, drive = 5) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive) * 0.75;
  return c;
}

function startEngine() {
  if (engineNodes) return;
  const ctx  = ensureAudio();
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const dist = ctx.createWaveShaper();
  const filt = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  dist.curve       = makeCurve(256, 6);
  filt.type        = "lowpass";
  filt.frequency.value = 300;
  filt.Q.value     = 1.8;

  osc1.type = osc2.type = "sawtooth";
  osc1.frequency.value = 65;
  osc2.frequency.value = 130;

  osc1.connect(dist); osc2.connect(dist);
  dist.connect(filt); filt.connect(gain); gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.9);

  osc1.start(); osc2.start();
  engineNodes = { osc1, osc2, filt, gain };
}

function stopEngine() {
  if (!engineNodes) return;
  const t = audioCtx.currentTime;
  engineNodes.gain.gain.linearRampToValueAtTime(0, t + 0.6);
  engineNodes.osc1.stop(t + 0.6);
  engineNodes.osc2.stop(t + 0.6);
  engineNodes = null;
}

function revEngine(fast = false) {
  if (!engineNodes) return;
  const t    = audioCtx.currentTime;
  const freq = fast ? 130 : 65;
  engineNodes.osc1.frequency.linearRampToValueAtTime(freq,     t + 1.4);
  engineNodes.osc2.frequency.linearRampToValueAtTime(freq * 2, t + 1.4);
  engineNodes.filt.frequency.linearRampToValueAtTime(fast ? 500 : 300, t + 1.2);
  engineNodes.gain.gain.linearRampToValueAtTime(fast ? 0.11 : 0.07, t + 1.0);
}

function honk() {
  const ctx  = ensureAudio();
  [349, 440].forEach((freq) => {
    const osc  = ctx.createOscillator();
    const dist = ctx.createWaveShaper();
    const gain = ctx.createGain();
    dist.curve = makeCurve(256, 8);
    osc.type   = "square";
    osc.frequency.value = freq;
    osc.connect(dist); dist.connect(gain); gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
    gain.gain.setValueAtTime(0.18, t + 0.60);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.88);
    osc.start(t); osc.stop(t + 0.9);
  });
}

// ── Exhaust particle system ────────────────────────────────────────────────
const EXHAUST_MAX = 100;
const exhPos  = new Float32Array(EXHAUST_MAX * 3).fill(9999);
const exhAlpha= new Float32Array(EXHAUST_MAX);
const exhVelX = new Float32Array(EXHAUST_MAX);
const exhVelY = new Float32Array(EXHAUST_MAX);
const exhVelZ = new Float32Array(EXHAUST_MAX);
const exhLife = new Float32Array(EXHAUST_MAX);   // remaining life (secs)
const exhMaxL = new Float32Array(EXHAUST_MAX);   // initial life for colour lerp
let   exhHead = 0;

const exhGeo = new THREE.BufferGeometry();
exhGeo.setAttribute("position", new THREE.BufferAttribute(exhPos, 3));
exhGeo.setAttribute("alpha",    new THREE.BufferAttribute(exhAlpha, 1));

const exhMat = new THREE.ShaderMaterial({
  uniforms: { nosMode: { value: 0 } },
  vertexShader: `
    attribute float alpha;
    varying float vAlpha;
    void main(){
      vAlpha = alpha;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = clamp(120.0 / -mv.z, 2.0, 18.0);
      gl_Position  = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float nosMode;
    varying float vAlpha;
    void main(){
      float d = length(gl_PointCoord - vec2(0.5));
      if(d > 0.5) discard;
      float a  = vAlpha * smoothstep(0.5, 0.1, d);
      vec3  smoke = vec3(0.55, 0.55, 0.55);
      vec3  flame = mix(vec3(1.0,0.85,0.4), vec3(0.9,0.3,0.1), 1.0-vAlpha);
      vec3  nos   = mix(vec3(0.4,0.6,1.0), vec3(0.7,0.2,1.0), 1.0-vAlpha);
      vec3  col   = mix(mix(smoke, flame, vAlpha), nos, nosMode);
      gl_FragColor = vec4(col, a);
    }`,
  transparent:  true,
  depthWrite:   false,
  blending:     THREE.AdditiveBlending,
});

const exhPoints = new THREE.Points(exhGeo, exhMat);
scene.add(exhPoints);

// Local exhaust pipe positions on car (rear, Z+)
const EXHAUST_PIPES = [
  new THREE.Vector3(-0.3, 0.29, 2.16),
  new THREE.Vector3( 0.3, 0.29, 2.16),
];

let exhSpawnTimer = 0;

function spawnExhaust(dt) {
  if (!state.engineOn || !parts.carScene) return;
  exhSpawnTimer += dt;
  const interval = state.driving ? 0.025 : 0.10;
  if (exhSpawnTimer < interval) return;
  exhSpawnTimer = 0;

  parts.carScene.updateWorldMatrix(true, false);

  EXHAUST_PIPES.forEach((local) => {
    const world = local.clone().applyMatrix4(parts.carScene.matrixWorld);
    const i = exhHead % EXHAUST_MAX;
    exhHead++;

    exhPos[i * 3]     = world.x;
    exhPos[i * 3 + 1] = world.y;
    exhPos[i * 3 + 2] = world.z;

    const speed = state.driving ? (nosActive ? 3.5 : 2.0) : 0.35;
    const back  = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(parts.carScene.quaternion)
      .multiplyScalar(speed);

    exhVelX[i] = back.x + (Math.random() - 0.5) * 0.25;
    exhVelY[i] = back.y + Math.random() * 0.18;
    exhVelZ[i] = back.z + (Math.random() - 0.5) * 0.25;

    const life  = state.driving ? 0.7 : 1.4;
    exhLife[i]  = life;
    exhMaxL[i]  = life;
    exhAlpha[i] = 1.0;
  });
}

function updateExhaust(dt) {
  for (let i = 0; i < EXHAUST_MAX; i++) {
    if (exhLife[i] <= 0) continue;
    exhLife[i] -= dt;
    if (exhLife[i] <= 0) {
      exhPos[i * 3] = exhPos[i * 3 + 1] = exhPos[i * 3 + 2] = 9999;
      exhAlpha[i] = 0;
      continue;
    }
    exhPos[i * 3]     += exhVelX[i] * dt;
    exhPos[i * 3 + 1] += exhVelY[i] * dt;
    exhPos[i * 3 + 2] += exhVelZ[i] * dt;
    exhVelY[i]        -= dt * 0.25;  // gentle gravity
    exhAlpha[i] = Math.max(0, exhLife[i] / exhMaxL[i]);
  }
  exhGeo.attributes.position.needsUpdate = true;
  exhGeo.attributes.alpha.needsUpdate    = true;
  exhMat.uniforms.nosMode.value = nosActive ? 1 : 0;
}

// ── Ground + presentation platform ────────────────────────────────────────
function buildGround() {
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x07111e, roughness: 0.40, metalness: 0.60, envMapIntensity: 1.2,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(44, 44, 0x1a3a5c, 0x0d2035);
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  grid.position.y = 0.002;
  scene.add(grid);

  // Holographic scan rings
  const ringDefs = [
    { r: 3.2, color: 0x67f0ff, op: 0.22 },
    { r: 4.6, color: 0x8eff78, op: 0.16 },
    { r: DRIVE_RADIUS, color: 0x67f0ff, op: 0.10 },
  ];
  ringDefs.forEach(({ r, color, op }, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: op, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.06, 96), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003 + i * 0.002;
    scene.add(ring);
    parts.scanRings.push(ring);
  });
}

// ── HDR environment ────────────────────────────────────────────────────────
function loadHDR() {
  new RGBELoader().load(
    "/venice_sunset_1k.hdr",
    (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = tex;
    }
  );
}

// ── Rear spoiler (deployable wing) ────────────────────────────────────────
function buildSpoiler(carRoot) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x111111, metalness: 0.75, roughness: 0.25, clearcoat: 0.6,
  });

  // Main blade
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.32), mat);
  blade.castShadow = true;
  grp.add(blade);

  // Stanchions
  [-0.70, 0.70].forEach((x) => {
    const stan = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.055), mat);
    stan.position.set(x, -0.14, 0);
    stan.castShadow = true;
    grp.add(stan);
  });

  grp.position.set(0, spoilerCurrentY, 2.02);
  carRoot.add(grp);
  parts.spoilerGroup = grp;
}

// ── Add brake/headlight elements to car ───────────────────────────────────
function addCarLights(carRoot) {
  // Headlights (front = –Z)
  const hlGeo = new THREE.SphereGeometry(0.045, 10, 10);
  [[-0.73, 0.46, -2.08], [0.73, 0.46, -2.08]].forEach(([x, y, z]) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(hlGeo, mat);
    mesh.position.set(x, y, z);
    carRoot.add(mesh);
    parts.headMeshes.push(mesh);

    const spot = new THREE.SpotLight(0xfff5e0, 0, 14, Math.PI / 9, 0.35, 1.5);
    spot.position.set(x, y, z - 0.1);
    const tgt = new THREE.Object3D();
    tgt.position.set(x, y - 0.3, z - 9);
    carRoot.add(tgt);
    spot.target = tgt;
    carRoot.add(spot);
    parts.headLights.push(spot);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff8d0, transparent: true, opacity: 0,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 16, 1, true), beamMat);
    beam.position.set(x, y - 0.15, z - 2.5);
    beam.rotation.x = Math.PI / 2;
    carRoot.add(beam);
    parts.headBeams.push(beamMat);
  });

  // Brake lights (rear = +Z)
  const blGeo = new THREE.BoxGeometry(0.24, 0.055, 0.02);
  [[-0.68, 0.52, 2.13], [0.68, 0.52, 2.13]].forEach(([x, y, z]) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(blGeo, mat);
    mesh.position.set(x, y, z);
    carRoot.add(mesh);
    parts.brakeMeshes.push(mesh);

    const pt = new THREE.PointLight(0xff2200, 0, 4, 2);
    pt.position.set(x, y, z + 0.15);
    carRoot.add(pt);
    parts.brakeLights.push(pt);
  });
}

// ── Load GLTF model ────────────────────────────────────────────────────────
function loadModel() {
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  loader.load(
    "/ferrari.glb",
    (gltf) => {
      const car = gltf.scene.children[0];

      parts.bodyMaterial = new THREE.MeshPhysicalMaterial({
        color:              new THREE.Color(state.bodyColor),
        metalness:          0.9,
        roughness:          0.15,
        clearcoat:          1.0,
        clearcoatRoughness: 0.08,
        envMapIntensity:    1.2,
      });

      const detailsMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 1.0, roughness: 0.2, envMapIntensity: 1,
      });

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x223344, metalness: 0.0, roughness: 0.0,
        transmission: 0.92, transparent: true, opacity: 0.25, ior: 1.5, thickness: 0.5,
      });

      const bodyMesh  = car.getObjectByName("body");  if (bodyMesh)  bodyMesh.material  = parts.bodyMaterial;
      const glassMesh = car.getObjectByName("glass"); if (glassMesh) glassMesh.material = glassMat;
      const trimMesh  = car.getObjectByName("trim");  if (trimMesh)  trimMesh.material  = detailsMat;
      ["rim_fl","rim_fr","rim_rr","rim_rl"].forEach((n) => {
        const m = car.getObjectByName(n); if (m) m.material = detailsMat;
      });

      // Wheel spin refs
      ["wheel_fl","wheel_fr","wheel_rl","wheel_rr"].forEach((n) => {
        const w = car.getObjectByName(n); if (w) parts.wheels.push(w);
      });

      // Steering wrappers for front wheels (steer on Y, spin on X independently)
      ["wheel_fl","wheel_fr"].forEach((n) => {
        const w = car.getObjectByName(n);
        if (!w) return;
        const wrap = new THREE.Group();
        wrap.position.copy(w.position);
        w.position.set(0, 0, 0);
        wrap.add(w);
        car.add(wrap);
        parts.frontWheelGroups.push(wrap);
      });

      car.traverse((c) => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });

      addCarLights(car);
      buildSpoiler(car);
      scene.add(gltf.scene);
      parts.carScene = gltf.scene;

      applyState(state);
      dismissOverlay();
    },
    (xhr) => {
      if (xhr.total > 0) {
        const bar = loadingOverlay?.querySelector(".load-bar-fill");
        if (bar) bar.style.width = `${Math.round((xhr.loaded / xhr.total) * 100)}%`;
      }
    },
    (err) => {
      console.error("Model load error", err);
      dismissOverlay("Failed to load model – check console.");
    }
  );
}

function dismissOverlay(msg) {
  if (!loadingOverlay) return;
  if (msg) {
    const lbl = loadingOverlay.querySelector(".load-label");
    if (lbl) lbl.textContent = msg;
  }
  loadingOverlay.style.opacity = "0";
  setTimeout(() => loadingOverlay.remove(), 700);
}

// Safety: dismiss overlay after 15s regardless
setTimeout(() => dismissOverlay(), 15000);

// ── HUD Themes ─────────────────────────────────────────────────────────────
const THEMES = {
  tracking:   { accent: "#67f0ff", bg: "#040913", exposure: 1.10 },
  diagnostic: { accent: "#b7ff56", bg: "#030e08", exposure: 1.25 },
  cinematic:  { accent: "#a07aff", bg: "#07040f", exposure: 0.85 },
};

function applyTheme(mode) {
  const t = THEMES[mode] || THEMES.tracking;
  document.documentElement.style.setProperty("--teal", t.accent);
  document.body.setAttribute("data-mode", mode);
  renderer.toneMappingExposure = t.exposure;
  scene.background = new THREE.Color(t.bg);
  scene.fog.color.set(t.bg);
  if (hudModeLabelEl) hudModeLabelEl.textContent = mode[0].toUpperCase() + mode.slice(1);
}

// ── Apply state to scene + UI ──────────────────────────────────────────────
function applyState(s) {
  Object.assign(state, s);

  // Brake lights
  parts.brakeMeshes.forEach((m) => { m.material.emissiveIntensity = s.brakeLights ? 3.5 : 0; });
  parts.brakeLights.forEach((l) => { l.intensity = s.brakeLights ? 5 : 0; });
  brakeToggleButton?.classList.toggle("active", s.brakeLights);
  if (brakeToggleButton) brakeToggleButton.textContent = s.brakeLights ? "Deactivate" : "Activate";
  if (telemetryLineEl)   telemetryLineEl.textContent   = s.brakeLights ? "Brake lights active" : "Brake lights standby";

  // Headlights
  parts.headMeshes.forEach((m) => { m.material.emissiveIntensity = s.headlights ? 4 : 0; });
  parts.headLights.forEach((l) => { l.intensity = s.headlights ? 7 : 0; });
  parts.headBeams.forEach((m)  => { m.opacity    = s.headlights ? 0.07 : 0; });
  headlightToggleButton?.classList.toggle("active", s.headlights);
  if (headlightToggleButton) headlightToggleButton.textContent = s.headlights ? "Disable" : "Enable";
  if (lightingLineEl)        lightingLineEl.textContent        = s.headlights ? "Headlights online" : "Headlights offline";

  // Body color
  if (parts.bodyMaterial) parts.bodyMaterial.color.set(s.bodyColor);
  if (colorInput) colorInput.value = s.bodyColor;

  // Engine
  if (s.engineOn) { startEngine(); } else { stopEngine(); }
  engineToggleButton?.classList.toggle("active", s.engineOn);
  if (engineToggleButton) engineToggleButton.textContent = s.engineOn ? "Stop Engine" : "Start Engine";
  if (speedLineEl)        speedLineEl.textContent        = s.engineOn ? (s.driving ? "Speed: — km/h" : "Engine idle") : "Engine off";

  // Drive mode
  if (s.driving && !s.engineOn) {
    // Force engine on if not already
    patchState({ engineOn: true, driving: true });
    return;
  }
  driveToggleButton?.classList.toggle("active", s.driving);
  if (driveToggleButton) driveToggleButton.textContent = s.driving ? "Park" : "Race!";
  if (s.driving) { revEngine(true); } else { revEngine(false); }

  // Spoiler
  spoilerTargetY = s.spoilerUp ? SPOILER_DEPLOYED : SPOILER_RETRACTED;
  spoilerToggleButton?.classList.toggle("active", s.spoilerUp);
  if (spoilerToggleButton) spoilerToggleButton.textContent = s.spoilerUp ? "Retract Wing" : "Deploy Wing";

  // Front wheel steer (manual, overridden during driving)
  if (!s.driving) {
    const steerRad = ((s.dumpBedTilt / 50) - 1) * (Math.PI / 5.1);
    parts.frontWheelGroups.forEach((g) => { g.rotation.y = steerRad; });
  }
  if (dumpTiltInput)  dumpTiltInput.value             = s.dumpBedTilt;
  if (dumpTiltValueEl) dumpTiltValueEl.textContent    = `${Math.round(s.dumpBedTilt)}%`;
  const steerDir = s.dumpBedTilt < 48 ? "← Left" : s.dumpBedTilt > 52 ? "Right →" : "Straight";
  if (dumpLineEl) dumpLineEl.textContent = `Steering ${Math.round(s.dumpBedTilt)}% · ${steerDir}`;

  // HUD mode
  if (s.hudMode) { applyTheme(s.hudMode); if (hudModeSelect) hudModeSelect.value = s.hudMode; }

  // Vehicle label
  if (s.vehicleLabel && vehicleLabelEl) vehicleLabelEl.textContent = s.vehicleLabel;

  // Version
  if (s.version !== undefined && versionLineEl)
    versionLineEl.textContent = `State version ${s.version}`;

  // REST example
  if (apiExampleEl) {
    apiExampleEl.textContent =
      `Invoke-RestMethod -Method POST -Uri \\\n  "http://127.0.0.1:8000/api/state" \\\n` +
      `  -ContentType "application/json" \\\n  -Body '${JSON.stringify({
        brakeLights: s.brakeLights, headlights: s.headlights, bodyColor: s.bodyColor,
        engineOn: s.engineOn, driving: s.driving,
      })}'`;
  }
}

// ── REST helpers ───────────────────────────────────────────────────────────
async function patchState(patch) {
  try {
    const res = await fetch(API_STATE_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    applyState(await res.json());
  } catch (e) { console.error("patchState", e); }
}

async function loadInitialState() {
  try { applyState(await (await fetch(API_STATE_URL)).json()); }
  catch (e) { console.error("loadInitialState", e); }
}

function connectStream() {
  const es = new EventSource(API_STREAM_URL);
  es.addEventListener("state", (e) => { try { applyState(JSON.parse(e.data)); } catch (_) {} });
  es.onopen  = () => { if (apiStatusEl) apiStatusEl.textContent = "Live stream synced"; };
  es.onerror = () => { if (apiStatusEl) apiStatusEl.textContent = "Reconnecting…"; };
}

// ── Camera preset animation ────────────────────────────────────────────────
function moveTo(presetName) {
  // Disable drive before going interior
  if (presetName === "interior" && state.driving) {
    patchState({ driving: false });
  }
  const p = PRESETS[presetName];
  if (!p) return;
  camMotion.from.copy(camera.position);
  camMotion.to.copy(p.pos);
  camMotion.tgtFrom.copy(controls.target);
  camMotion.tgtTo.copy(p.target);
  camMotion.t = 0;
  camMotion.isInterior = presetName === "interior";
  if (camMotion.isInterior) {
    controls.minDistance = 0.05; controls.maxDistance = 4;
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  } else {
    controls.minDistance = 1.8; controls.maxDistance = 28;
    controls.minPolarAngle = 0.06; controls.maxPolarAngle = Math.PI * 0.70;
  }
}

function easeInOut(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

// ── NOS boost ─────────────────────────────────────────────────────────────
function fireNOS() {
  if (!state.engineOn) { patchState({ engineOn: true }); }
  if (!state.driving)  { patchState({ driving: true }); }
  nosActive = true;
  nosTimer  = 0;
  nosButton?.classList.add("firing");
  if (engineNodes) {
    const t = audioCtx.currentTime;
    engineNodes.osc1.frequency.linearRampToValueAtTime(200, t + 0.3);
    engineNodes.osc2.frequency.linearRampToValueAtTime(400, t + 0.3);
    engineNodes.gain.gain.linearRampToValueAtTime(0.15, t + 0.3);
  }
}

// ── Resize ─────────────────────────────────────────────────────────────────
function handleResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// ── Main animation loop ────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = clock.getElapsedTime();

  // ── Camera lerp
  if (camMotion.t < 1) {
    camMotion.t = Math.min(1, camMotion.t + dt * 0.85);
    const e = easeInOut(camMotion.t);
    camera.position.lerpVectors(camMotion.from, camMotion.to, e);
    controls.target.lerpVectors(camMotion.tgtFrom, camMotion.tgtTo, e);
  }

  // ── Drive mode
  if (state.driving && parts.carScene) {
    // NOS timer
    if (nosActive) {
      nosTimer += dt;
      if (nosTimer > 3.5) {
        nosActive = false;
        nosButton?.classList.remove("firing");
        revEngine(true); // return to fast idle
      }
    }
    const speedMult = nosActive ? 3.2 : 1.0;
    currentSpeed = THREE.MathUtils.lerp(currentSpeed, speedMult, dt * 2);
    driveAngle  += dt * DRIVE_SPEED_BASE * currentSpeed;

    const cx = Math.sin(driveAngle) * DRIVE_RADIUS;
    const cz = Math.cos(driveAngle) * DRIVE_RADIUS;
    parts.carScene.position.lerp(new THREE.Vector3(cx, 0, cz), 0.18);

    // Face direction of travel (tangent to circle)
    const targetYaw = driveAngle + Math.PI;
    let diff = targetYaw - parts.carScene.rotation.y;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    parts.carScene.rotation.y += diff * 0.14;

    // Front wheels steer slightly for circular motion
    parts.frontWheelGroups.forEach((g) => { g.rotation.y = 0.13; });

    // Camera follows car
    if (!camMotion.isInterior) {
      controls.target.lerp(
        new THREE.Vector3(cx, 0.5, cz), dt * 1.8
      );
    }

    // Chassis rock side to side
    parts.carScene.rotation.z = Math.sin(t * DRIVE_SPEED_BASE * currentSpeed * 4) * 0.012;

    // HUD speed
    const kmh = Math.round(DRIVE_SPEED_BASE * currentSpeed * DRIVE_RADIUS * 3.6);
    const rpm  = Math.round(800 + kmh * 38 * (nosActive ? 1.6 : 1));
    if (speedLineEl) speedLineEl.textContent = `${kmh} km/h · ${rpm} RPM`;
  } else if (parts.carScene) {
    // Return to origin when parked
    parts.carScene.position.lerp(new THREE.Vector3(0, 0, 0), dt * 1.5);
    parts.carScene.rotation.y = THREE.MathUtils.lerp(parts.carScene.rotation.y, 0, dt * 1.5);
    parts.carScene.rotation.z = THREE.MathUtils.lerp(parts.carScene.rotation.z, 0, dt * 3);
    controls.target.lerp(new THREE.Vector3(0, 0.5, 0), dt * 1.2);
    currentSpeed = THREE.MathUtils.lerp(currentSpeed, 0, dt * 3);
    if (speedLineEl && state.engineOn) speedLineEl.textContent = "Engine idle";
  }

  // ── Wheel spin
  const spinSpeed = state.driving ? (2.5 * currentSpeed) : (state.engineOn ? 0.25 : 0.06);
  parts.wheels.forEach((w) => { w.rotation.x -= dt * spinSpeed; });

  // ── Spoiler animation (lerp Y position)
  if (parts.spoilerGroup) {
    spoilerCurrentY = THREE.MathUtils.lerp(spoilerCurrentY, spoilerTargetY, dt * 3.5);
    parts.spoilerGroup.position.y = spoilerCurrentY;
  }

  // ── Engine chassis vibration
  if (state.engineOn && parts.carScene && !state.driving) {
    parts.carScene.position.y = Math.sin(t * 62) * 0.0018;
  }

  // ── Scan rings pulse
  parts.scanRings.forEach((r, i) => {
    r.material.opacity = (0.18 - i * 0.03) + 0.07 * Math.sin(t * 1.6 + i * 1.3);
    r.scale.setScalar(1 + 0.014 * Math.sin(t * 2.2 + i * 0.9));
  });

  // ── Exhaust
  spawnExhaust(dt);
  updateExhaust(dt);

  handleResize();
  controls.update();
  renderer.render(scene, camera);
}

// ── Event listeners ────────────────────────────────────────────────────────
brakeToggleButton?.   addEventListener("click", () => patchState({ brakeLights: !state.brakeLights }));
headlightToggleButton?.addEventListener("click", () => patchState({ headlights:  !state.headlights }));
engineToggleButton?.  addEventListener("click", () => {
  ensureAudio(); // must be inside user gesture
  patchState({ engineOn: !state.engineOn, ...(state.engineOn ? { driving: false } : {}) });
});
driveToggleButton?.addEventListener("click", () => {
  ensureAudio();
  if (!state.driving) {
    patchState({ driving: true, engineOn: true });
  } else {
    patchState({ driving: false });
  }
});
spoilerToggleButton?.addEventListener("click", () => patchState({ spoilerUp: !state.spoilerUp }));
hornButton?.addEventListener("click",           () => { ensureAudio(); honk(); });
nosButton?.addEventListener("click",            () => { ensureAudio(); fireNOS(); });

dumpTiltInput?.addEventListener("input", (e) => {
  const v = Number(e.target.value);
  if (dumpTiltValueEl) dumpTiltValueEl.textContent = `${Math.round(v)}%`;
  if (!state.driving) {
    const rad = ((v / 50) - 1) * (Math.PI / 5.1);
    parts.frontWheelGroups.forEach((g) => { g.rotation.y = rad; });
  }
  const dir = v < 48 ? "← Left" : v > 52 ? "Right →" : "Straight";
  if (dumpLineEl) dumpLineEl.textContent = `Steering ${Math.round(v)}% · ${dir}`;
});
dumpTiltInput?.addEventListener("change", (e) => patchState({ dumpBedTilt: Number(e.target.value) }));
colorInput?.addEventListener("input",    (e) => { if (parts.bodyMaterial) parts.bodyMaterial.color.set(e.target.value); });
colorInput?.addEventListener("change",   (e) => patchState({ bodyColor: e.target.value }));
hudModeSelect?.addEventListener("change", (e) => patchState({ hudMode: e.target.value }));
cameraButtons.forEach((b) => b.addEventListener("click", () => moveTo(b.dataset.camera)));
copyCommandButton?.addEventListener("click", () => {
  navigator.clipboard?.writeText(apiExampleEl?.textContent ?? "");
  copyCommandButton.textContent = "Copied!";
  setTimeout(() => { copyCommandButton.textContent = "Copy PowerShell example"; }, 2000);
});

// ── Boot ───────────────────────────────────────────────────────────────────
buildGround();
loadHDR();
loadModel();
moveTo("hero");
applyTheme("tracking");
loadInitialState().then(() => connectStream());
animate();
