import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  AIM,
  ARENA,
  CAMERA,
  DANCE,
  LAMPS,
  LIGHTING,
  BOSH,
  HAZARD,
  ROOM,
  MAX_LAMPS,
  MOTH_LOOK,
  TEAM_COLOURS,
  TILT_SHIFT,
} from '../config';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { createTiltShiftPasses } from './tiltShift';
import { createWeaponEffects } from './weaponEffects';
import type { AimPreview } from './weaponEffects';
import type { Aim } from '../game/gadgets';
import type { WorldEvent } from '../game/world';
import { updateFur } from './fur';
import type { BoxPiece, CylinderPiece } from '../config';
import type { MothView, WorldView } from '../game/world';

export type CameraMode = 'follow' | 'board';
import { createMaterials } from './materials';
import { createMoth } from './moth';
import { preloadWeaponModels } from './weaponModels';
import type { WeaponId } from '../config';
import { createWarning } from './hand';
import { createPeople } from './people';
import { createGadgetVisuals } from './gadgetVisuals';
import { fitProp, isProp } from './props';
import { LEVEL } from '../config';
import type { TerrainPiece } from '../config';

export function createScene(host: HTMLElement) {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    '3D miniature bedroom. Drag to rotate the camera; scroll to zoom.',
  );
  renderer.domElement.tabIndex = 0;
  const scene = new Scene();
  scene.background = new Color(0x101922);
  scene.fog = new FogExp2(0x101922, 0.012);
  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 900);
  // Post-processing renders in linear light; OutputPass applies tone mapping
  // and sRGB conversion at the end, as the renderer does without it.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const tiltShift = createTiltShiftPasses();
  tiltShift.passes.forEach((pass) => composer.addPass(pass));
  composer.addPass(new OutputPass());
  const focusPoint = new Vector3();
  let focusLine = TILT_SHIFT.focus;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  /** Read the live tuning values that do not need a rebuild. */
  function applySettings() {
    // OrbitControls has one drag speed for both axes, so a negative speed
    // inverts horizontal and vertical mouse drag together.
    controls.rotateSpeed = CAMERA.invertX && CAMERA.invertY ? -1 : 1;
    if (camera.fov !== CAMERA.fov) {
      camera.fov = CAMERA.fov;
      camera.updateProjectionMatrix();
    }
    renderer.toneMappingExposure = LIGHTING.exposure;
    if (scene.fog instanceof FogExp2) scene.fog.density = LIGHTING.fog;
    ambient.intensity =
      LIGHTING.ambient * (cameraMode === 'board' ? MOTH_LOOK.boardLight : 1);
    moon.intensity = LIGHTING.moon;
  }
  // The board view pulls back in proportion to the desk it has to frame.
  const boardScale = ARENA.desk.width / 250;
  const homePosition = new Vector3(95, 150, 235).multiplyScalar(boardScale);
  const homeTarget = new Vector3(0, 0, 8 * boardScale);
  // 'follow' sits behind the active moth's shoulder; 'board' shows the desk.
  let cameraMode: CameraMode = 'follow';
  let lastView: WorldView | undefined;
  let lastSelected = -1;
  let lastRespawning = false;
  let lastSeconds: number | undefined;
  const followTarget = new Vector3();
  /** A spot the camera is held on for a moment of drama, such as a smack. */
  let spotlight:
    { x: number; z: number; from?: { x: number; z: number } } | undefined;
  let spotlit = false;
  /** How far through the sweep round the desk before a match, 0 to 1. */
  let flyby: number | undefined;
  /** Where the dance camera is, before scenery in the way pulls it in. */
  let danceCamera: Vector3 | undefined;
  /** The side and height the dance camera took for the routine in progress. */
  let danceView: { key: string; swing: number; lift: number } | undefined;
  /** Whether nothing on the desk stands between two points. */
  function clearView(from: Vector3, to: Vector3) {
    const offset = to.clone().sub(from);
    const distance = offset.length();
    occlusionRay.set(from, offset.divideScalar(distance));
    occlusionRay.far = distance;
    return !occlusionRay.intersectObjects(occluders, false).length;
  }
  // A second camera for the corner "splat cam": it faces the giant, with the
  // spot being swatted in the foreground.
  const insetCamera = new PerspectiveCamera(62, 1.6, 0.1, 600);
  /** The splat cam's rectangle in CSS pixels, measured from bottom-left. */
  function insetRect() {
    const width = Math.max(host.clientWidth, 1);
    const size = Math.min(420, width * 0.3);
    return {
      x: width - size - width * 0.045,
      y: 132,
      width: size,
      height: size * 0.62,
    };
  }
  /** Draw the splat cam over the corner of the frame just rendered. */
  function drawInset() {
    if (!spotlight?.from) return;
    const { x, y, width, height } = insetRect();
    // Stand on the far side of the spot from the giant, looking back at them.
    const away = new Vector3(
      spotlight.x - spotlight.from.x,
      0,
      spotlight.z - spotlight.from.z,
    );
    const reach = Math.max(away.length(), 1e-3);
    away.divideScalar(reach);
    insetCamera.aspect = width / height;
    insetCamera.updateProjectionMatrix();
    insetCamera.position
      .set(spotlight.x, 6, spotlight.z)
      .addScaledVector(away, 12);
    // Aim well up the giant, so their face is in shot above the hand.
    insetCamera.lookAt(
      spotlight.x - away.x * reach * 0.6,
      8.5,
      spotlight.z - away.z * reach * 0.6,
    );
    const full = renderer.getSize(new Vector2());
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, width, height);
    renderer.setViewport(x, y, width, height);
    // The giants fade out of the main camera's way; here they are the show.
    const refade = people.showSolid();
    renderer.render(scene, insetCamera);
    refade();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, full.x, full.y);
  }
  function applyLimits() {
    const follow = cameraMode === 'follow';
    controls.minDistance = follow ? CAMERA.followMinDistance : 30 * boardScale;
    controls.maxDistance = follow ? CAMERA.followMaxDistance : 420;
    controls.minPolarAngle = follow ? 0.55 : 0.45;
    controls.maxPolarAngle = follow ? 1.42 : 1.43;
    controls.minAzimuthAngle = follow ? -Infinity : -0.85;
    controls.maxAzimuthAngle = follow ? Infinity : 0.85;
  }
  // Scenery the shoulder camera must not sit behind (moths and lamps excluded).
  const occluders: Mesh[] = [];
  const occlusionRay = new Raycaster();
  // Where the player's orbit puts the camera, before collision pulls it in.
  let unobstructed: Vector3 | undefined;
  /** Pull the camera in front of anything between it and the moth. */
  function avoidOcclusion() {
    const target = controls.target;
    const offset = camera.position.clone().sub(target);
    const distance = offset.length();
    if (distance < 0.01) return;
    occlusionRay.set(target, offset.divideScalar(distance));
    occlusionRay.far = distance;
    const hit = occlusionRay.intersectObjects(occluders, false)[0];
    if (!hit) return;
    const safe = Math.max(CAMERA.followMinDistance * 0.5, hit.distance - 0.3);
    camera.position.copy(target).addScaledVector(offset, safe);
  }
  function placeCamera(position: Vector3, target: Vector3) {
    unobstructed = undefined;
    // Flush previous orbit damping so a snap cannot drift on the next frame.
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    controls.enableDamping = true;
  }
  function mothFocus(moth: MothView, out: Vector3) {
    return out.set(moth.x, moth.y + CAMERA.followHeight, moth.z);
  }
  /** Snap behind the active moth, looking the way it faces. */
  function snapBehind() {
    const active = lastView?.moths[lastView.selectedMoth];
    if (!active || active.respawning) return;
    mothFocus(active, followTarget);
    const behind = new Vector3(
      -Math.sin(active.heading),
      0,
      -Math.cos(active.heading),
    );
    const position = followTarget
      .clone()
      .addScaledVector(behind, CAMERA.followDistance)
      .setY(followTarget.y + CAMERA.followRise);
    placeCamera(position, followTarget);
  }
  function applyShoulderOffset() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    // Shift the frame so the moth sits to one side, clear of the HUD panel.
    if (cameraMode === 'follow')
      camera.setViewOffset(
        width,
        height,
        width * CAMERA.shoulderOffset,
        0,
        width,
        height,
      );
    else camera.clearViewOffset();
  }
  function resetCamera() {
    applyLimits();
    applyShoulderOffset();
    if (cameraMode === 'follow' && lastView) snapBehind();
    else placeCamera(homePosition, homeTarget);
  }
  resetCamera();
  const materials = createMaterials();
  const cream = new MeshStandardMaterial({ color: 0xc5bda4, roughness: 0.95 });
  const dark = new MeshStandardMaterial({ color: 0x302a2a, roughness: 0.8 });
  const brass = new MeshStandardMaterial({
    color: 0x9a7746,
    roughness: 0.45,
    metalness: 0.65,
  });
  function box(
    parent: Group | Scene,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial,
  ) {
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    occluders.push(mesh);
    return mesh;
  }
  function cylinder(
    parent: Group | Scene,
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial,
    open = false,
  ) {
    const mesh = new Mesh(
      new CylinderGeometry(radius, radius, height, 32, 1, open),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    occluders.push(mesh);
    return mesh;
  }
  const ambient = new HemisphereLight(0xb7d0df, 0x775441, LIGHTING.ambient);
  scene.add(ambient);
  const moon = new SpotLight(0x9dbfe0, LIGHTING.moon, 320, 0.9, 1, 1.2);
  moon.position.set(-120, 70, -60);
  moon.target.position.set(-30, 0, 10);
  scene.add(moon, moon.target);

  const deskDepth = ARENA.desk.depth;
  const floorY = ROOM.floorY;
  const wallZ = -deskDepth / 2 - 1.5;
  const wallMaterial = new MeshStandardMaterial({
    color: 0x38484c,
    roughness: 1,
  });
  const wallStripe = new MeshStandardMaterial({
    color: 0x435154,
    roughness: 1,
  });
  const roomWidth = ARENA.desk.width + 160;
  const wallHeight = 120;
  box(
    scene,
    roomWidth,
    wallHeight,
    0.4,
    0,
    floorY + wallHeight / 2,
    wallZ,
    wallMaterial,
  );
  box(scene, roomWidth, 0.4, 260, 0, floorY, wallZ + 130, materials.wood);
  for (let x = -roomWidth / 2 + 2; x < roomWidth / 2; x += 4)
    box(
      scene,
      0.08,
      wallHeight,
      0.04,
      x,
      floorY + wallHeight / 2,
      wallZ + 0.22,
      wallStripe,
    );
  box(scene, roomWidth, 1, 0.4, 0, floorY + 0.5, wallZ + 0.3, cream);
  // Moonlit window and a simple framed print anchor the room behind the arena.
  const windowX = -60;
  // Window and prints are scaled up with the room; y is height on the wall.
  const W = 3;
  box(scene, 5 * W, 6 * W, 0.15, windowX, 6 * W, wallZ + 0.22, dark);
  const glass = new MeshStandardMaterial({
    color: 0x344f6c,
    emissive: 0x304a68,
    emissiveIntensity: 0.4,
    roughness: 0.3,
  });
  box(scene, 4.6 * W, 5.6 * W, 0.08, windowX, 6 * W, wallZ + 0.33, glass);
  box(scene, 0.12 * W, 5.6 * W, 0.12, windowX, 6 * W, wallZ + 0.43, cream);
  box(scene, 4.6 * W, 0.12 * W, 0.12, windowX, 6 * W, wallZ + 0.43, cream);
  box(
    scene,
    5.5 * W,
    0.18 * W,
    0.7 * W,
    windowX,
    2.95 * W,
    wallZ + 0.4 * W,
    cream,
  );
  const moonDisc = new Mesh(
    new SphereGeometry(0.6, 24, 16),
    new MeshBasicMaterial({ color: 0xe5d9b4 }),
  );
  moonDisc.scale.z = 0.08;
  moonDisc.position.set(windowX - 1.1 * W, 7.6 * W, wallZ + 0.41);
  moonDisc.scale.multiplyScalar(W);
  scene.add(moonDisc);
  box(scene, 2.8 * W, 3.6 * W, 0.12, 55, 6 * W, wallZ + 0.22, brass);
  box(
    scene,
    2.45 * W,
    3.25 * W,
    0.08,
    55,
    6 * W,
    wallZ + 0.31,
    materials.felt(0x927d63),
  );
  box(scene, 1.8 * W, 1.8 * W, 0.12, 70, 4.6 * W, wallZ + 0.22, brass);
  box(
    scene,
    1.55 * W,
    1.55 * W,
    0.08,
    70,
    4.6 * W,
    wallZ + 0.31,
    materials.felt(0x6e8a7a),
  );

  const kitchen = LEVEL === 'kitchen';
  const stone = new MeshStandardMaterial({ color: 0x77736c, roughness: 0.55 });
  const cupboard = new MeshStandardMaterial({
    color: 0x5f7d6e,
    roughness: 0.8,
  });
  /**
   * Scenery with a model: a plain stand-in the shape of its collider, which
   * steps aside for the model once that has loaded.
   */
  function drawProp(piece: TerrainPiece) {
    if (!isProp(piece.kind)) return false;
    const { x, y, z, color } = piece;
    const round = piece.shape === 'cylinder';
    const stand = round
      ? cylinder(
          scene,
          piece.radius,
          piece.height,
          x,
          y,
          z,
          materials.felt(color),
        )
      : box(
          scene,
          piece.width,
          piece.height,
          piece.depth,
          x,
          y,
          z,
          materials.felt(color),
        );
    const bounds = round
      ? {
          width: piece.radius * 2,
          height: piece.height,
          depth: piece.radius * 2,
        }
      : { width: piece.width, height: piece.height, depth: piece.depth };
    void fitProp(piece.kind, bounds).then((model) => {
      if (!model) return;
      model.position.set(x, y, z);
      // Round things face any way they like, the same way each time.
      if (round)
        model.rotation.y = Math.sin(x * 12.9898 + z * 78.233) * Math.PI;
      scene.add(model);
      stand.visible = false;
    });
    return true;
  }
  function drawBooks(piece: BoxPiece) {
    const { x, y, z, width, height, depth, color } = piece;
    const cover = materials.felt(color);
    const levels = piece.levels ?? 2;
    const bookHeight = height / levels;
    for (let i = 0; i < levels; i++) {
      const bottom = y - height / 2 + i * bookHeight;
      // Alternate tiny overhangs so the stack reads as separate books.
      const nudge = i % 2 ? 0.06 : -0.04;
      box(
        scene,
        width - 0.08,
        bookHeight - 0.08,
        depth - 0.1,
        x + nudge,
        bottom + bookHeight / 2,
        z,
        cream,
      );
      box(scene, width, 0.04, depth, x + nudge, bottom + 0.02, z, cover);
      box(
        scene,
        width,
        0.04,
        depth,
        x + nudge,
        bottom + bookHeight - 0.02,
        z,
        cover,
      );
      box(
        scene,
        0.08,
        bookHeight,
        depth,
        x + nudge - width / 2 + 0.04,
        bottom + bookHeight / 2,
        z,
        cover,
      );
      // Two page lines per book keeps draw calls down on the large desk.
      for (let j = 1; j < 3; j++) {
        box(
          scene,
          width - 0.2,
          0.008,
          0.012,
          x + nudge,
          bottom + 0.05 + (j * (bookHeight - 0.1)) / 3,
          z + depth / 2 - 0.04,
          brass,
        );
      }
    }
  }
  function drawBox(piece: BoxPiece) {
    const { x, y, z, width, height, depth, color } = piece;
    const top = y + height / 2;
    if (piece.kind === 'desk' && kitchen) {
      // A stone worktop on painted cupboards, one run for each slab.
      box(scene, width, 0.6, depth, x, -0.3, z, stone);
      const drop = -0.6 - floorY;
      box(
        scene,
        width - (Math.abs(x) + width / 2 >= ARENA.desk.width / 2 ? 0.8 : 0),
        drop,
        depth - (z + depth / 2 >= ARENA.desk.depth / 2 ? 0.8 : 0),
        x,
        floorY + drop / 2,
        z - (z + depth / 2 >= ARENA.desk.depth / 2 ? 0.4 : 0),
        cupboard,
      );
      return;
    }
    if (piece.kind === 'desk') {
      box(scene, width, height, depth, x, y, z, materials.wood);
      box(scene, width - 2, 3, depth - 2, x, -2, z, materials.wood);
      const legHeight = -3.5 - floorY;
      for (const legX of [-width / 2 + 3, width / 2 - 3])
        for (const legZ of [-depth / 2 + 3, depth / 2 - 3])
          box(
            scene,
            4,
            legHeight,
            4,
            legX,
            floorY + legHeight / 2,
            legZ,
            materials.wood,
          );
      return;
    }
    if (piece.kind === 'books') return drawBooks(piece);
    if (piece.kind === 'laptop') {
      const shell = new MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.6,
      });
      box(scene, width, height, depth, x, y, z, shell);
      box(scene, width - 0.1, 0.02, 0.06, x, top - 0.12, z + depth / 2, dark);
      const logo = new Mesh(
        new SphereGeometry(0.22, 16, 8),
        new MeshBasicMaterial({ color: 0x8e9aa6 }),
      );
      logo.scale.y = 0.05;
      logo.position.set(x, top + 0.005, z);
      scene.add(logo);
      return;
    }
    if (piece.kind === 'box') {
      // A matchbox: felt sleeve with a lighter tray peeking out.
      box(scene, width, height, depth, x, y, z, materials.felt(color));
      box(
        scene,
        width * 0.94,
        height * 0.8,
        depth * 0.3,
        x,
        y - height * 0.05,
        z + depth * 0.62,
        cream,
      );
      box(scene, width * 0.6, 0.02, depth * 0.5, x, top + 0.01, z, cream);
      return;
    }
    // Sticky notes and erasers.
    box(scene, width, height, depth, x, y, z, materials.felt(color));
    box(scene, width, 0.02, depth, x, top + 0.01, z, cream);
  }
  function drawCylinder(piece: CylinderPiece) {
    const { x, y, z, radius, height, color } = piece;
    const bottom = y - height / 2;
    const top = y + height / 2;
    if (piece.kind === 'mug') {
      const ceramic = new MeshStandardMaterial({
        color,
        roughness: 0.6,
        side: DoubleSide,
      });
      cylinder(scene, radius, height, x, y, z, ceramic, true);
      cylinder(scene, radius, 0.05, x, bottom + 0.025, z, ceramic);
      const rim = new Mesh(new TorusGeometry(radius, 0.06, 8, 32), ceramic);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, top, z);
      scene.add(rim);
      cylinder(scene, radius - 0.05, 0.03, x, top - 0.45, z, dark);
      const handle = new Mesh(
        new TorusGeometry(radius * 0.55, 0.12, 8, 20),
        ceramic,
      );
      handle.position.set(x + radius, y, z);
      handle.castShadow = true;
      scene.add(handle);
      return;
    }
    if (piece.kind === 'pot') {
      const pot = materials.felt(color);
      cylinder(scene, radius, height, x, y, z, pot, true);
      cylinder(scene, radius, 0.05, x, bottom + 0.025, z, pot);
      const colours = [0xc19142, 0x5a7f4f, 0xa04f43, 0x3f5d87, 0xc9b37a];
      colours.forEach((colour, i) => {
        const angle = (i / colours.length) * Math.PI * 2;
        const pencil = cylinder(
          scene,
          0.08,
          3,
          x + Math.cos(angle) * radius * 0.45,
          top + 0.2,
          z + Math.sin(angle) * radius * 0.45,
          materials.felt(colour),
        );
        pencil.rotation.set(Math.sin(angle) * 0.18, 0, -Math.cos(angle) * 0.18);
      });
      return;
    }
    if (piece.kind === 'spool') {
      cylinder(
        scene,
        radius * 0.75,
        height - 0.1,
        x,
        y,
        z,
        materials.felt(color),
      );
      for (const end of [bottom + 0.04, top - 0.04])
        cylinder(scene, radius, 0.08, x, end, z, materials.wood);
      return;
    }
    // A shallow tin of buttons.
    const tin = new MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.5,
    });
    cylinder(scene, radius, height, x, y, z, tin);
    cylinder(scene, radius * 0.7, 0.02, x, top + 0.01, z, brass);
  }
  for (const piece of ARENA.terrain) {
    if (drawProp(piece)) continue;
    if (piece.shape === 'box') drawBox(piece);
    else drawCylinder(piece);
  }

  // Loose desk clutter is decoration only; it is too flat to need colliders.
  const decor: Array<[number, number, number, number]> = [
    [-8.5, 6.5, -0.3, 0xc19142],
    [7.4, 6.8, 1.1, 0x5a7f4f],
    [-20, -2, 0.6, 0xa04f43],
    [21, -6, -0.8, 0x3f5d87],
    [1, 12, 0.2, 0xc9b37a],
  ];
  for (const [x, z, turn, colour] of kitchen ? [] : decor) {
    const pencil = cylinder(
      scene,
      0.07,
      3.2,
      x,
      0.07,
      z,
      materials.felt(colour),
    );
    pencil.rotation.set(0, turn, Math.PI / 2);
  }
  for (const [x, z] of kitchen
    ? []
    : ([
        [19.6, -4.2],
        [20.1, -3.6],
        [-1.6, 7.4],
        [-24, 12],
      ] as const))
    cylinder(scene, 0.32, 0.05, x, 0.025, z, brass);

  const bulbMaterial = new MeshStandardMaterial({
    color: 0xffefd0,
    emissive: 0xffb34b,
    emissiveIntensity: 3,
    roughness: 0.3,
  });
  const cordMaterial = new LineBasicMaterial({ color: 0x372b24 });
  const haloMaterial = new MeshBasicMaterial({
    color: 0xedc778,
    transparent: true,
    opacity: 0.48,
    side: DoubleSide,
    depthWrite: false,
  });
  const bulbGeometry = new SphereGeometry(ARENA.lampRadius, 24, 16);
  const socketGeometry = new CylinderGeometry(0.11, 0.13, 0.24, 16);
  const haloGeometry = new RingGeometry(0.985, 1, 96);
  const crossBar = new BoxGeometry(1.5, 0.02, 0.16);
  // A fixed pool of lamps; the world decides how many are hanging.
  const cageGeometry = new CylinderGeometry(0.42, 0.42, 0.75, 10, 4, true);
  // Only the lamps nearest the camera's focus cast shadows: the shadowed
  // lights are handed to them each frame, so the light count never changes.
  const SHADOWED_LIGHTS = 3;
  const lampVisuals = Array.from({ length: MAX_LAMPS }, (_, lightIndex) => {
    const group = new Group();
    // Per-lamp materials, so one lamp can turn into a zapper on its own.
    const glow = bulbMaterial.clone();
    const bulb = new Mesh(bulbGeometry, glow);
    bulb.scale.y = 1.25;
    group.add(bulb);
    const socket = new Mesh(socketGeometry, brass);
    socket.position.y = 0.28;
    group.add(socket);
    // The bug-zapper grid, shown only while the lamp is inverted.
    const cage = new Mesh(
      cageGeometry,
      new MeshBasicMaterial({ color: 0x8f7bd6, wireframe: true }),
    );
    cage.position.y = -0.05;
    group.add(cage);
    const cordGeometry = new BufferGeometry().setFromPoints([
      new Vector3(),
      new Vector3(),
    ]);
    const cord = new Line(cordGeometry, cordMaterial);
    cord.frustumCulled = false;
    // This ring shows the halo's cross-section on the desk, not a score.
    const ring = haloMaterial.clone();
    const halo = new Mesh(haloGeometry, ring);
    halo.rotation.x = -Math.PI / 2;
    // A big red cross on the desk marks a burnt-out lamp's patch as dead.
    const crossInk = new MeshBasicMaterial({
      color: 0xe2503a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const cross = new Group();
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new Mesh(crossBar, crossInk);
      bar.rotation.y = turn;
      cross.add(bar);
    }
    cross.visible = false;
    // Each lamp casts its own shadows from a smaller map to stay inexpensive.
    const light = new SpotLight(
      0xffc987,
      LIGHTING.lampIntensity,
      45,
      1.25,
      0.75,
      1.4,
    );
    light.castShadow = lightIndex < SHADOWED_LIGHTS;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.035;
    light.shadow.camera.near = 0.3;
    light.shadow.camera.far = 45;
    scene.add(group, cord, halo, cross, light, light.target);
    return {
      group,
      cord,
      cordGeometry,
      halo,
      cross,
      crossInk,
      light,
      glow,
      cage,
      ring,
    };
  });
  const weaponEffects = createWeaponEffects(scene, camera, host);
  // Board-view pins: at full-desk zoom a moth is a speck, so each gets a
  // team-coloured numbered pin overlaid on the canvas. Clicking one selects.
  const pins = ARENA.spawns.map(({ name, team }, index) => {
    const pin = document.createElement('div');
    pin.className = 'moth-pin';
    pin.dataset.team = String(team);
    const label = document.createElement('span');
    label.textContent = String(index + 1);
    pin.appendChild(label);
    pin.title = name;
    pin.hidden = true;
    host.appendChild(pin);
    return pin;
  });
  const pinPoint = new Vector3();
  function updatePins(view: WorldView) {
    const board = cameraMode === 'board';
    pins.forEach((pin, index) => {
      const moth = view.moths[index];
      let visible = board && !!moth && !moth.respawning;
      if (visible && moth) {
        pinPoint.set(moth.x, moth.y + ARENA.mothRadius, moth.z).project(camera);
        visible = pinPoint.z < 1;
        pin.style.left = `${((pinPoint.x + 1) / 2) * 100}%`;
        pin.style.top = `${((1 - pinPoint.y) / 2) * 100}%`;
        pin.classList.toggle('active', index === view.selectedMoth);
        pin.classList.toggle('zapped', !!moth.zapped);
      }
      if (pin.hidden === visible) pin.hidden = !visible;
    });
  }
  // Screen shake strength, decaying each frame; applied only while drawing.
  let shake = 0;
  const shakeOffset = new Vector3();
  const moths = ARENA.spawns.map(({ color, team }, index) =>
    createMoth(materials, color, team, index * 1.7),
  );
  moths.forEach((moth) => scene.add(moth.root));
  const warning = createWarning();
  const people = createPeople(materials);
  const gadgetVisuals = createGadgetVisuals(scene, materials);
  if (kitchen) drawKitchen();
  /** What makes it a kitchen: tiles behind the worktop, and the sink in it. */
  function drawKitchen() {
    const tile = new MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.25 });
    const grout = new MeshStandardMaterial({ color: 0x9aa39c, roughness: 0.9 });
    const tilesHigh = 24;
    const back = -ARENA.desk.depth / 2 - 0.9;
    const across = ARENA.desk.width + 60;
    box(scene, across, tilesHigh, 0.4, 0, tilesHigh / 2 - 0.5, back, tile);
    for (let y = 2.2; y < tilesHigh; y += 2.4)
      box(scene, across, 0.08, 0.06, 0, y - 0.5, back + 0.22, grout);
    for (let x = -across / 2 + 2; x < across / 2; x += 4.8)
      box(
        scene,
        0.08,
        tilesHigh,
        0.06,
        x,
        tilesHigh / 2 - 0.5,
        back + 0.22,
        grout,
      );
    // A shelf closes the tiles off at the top.
    box(
      scene,
      across,
      0.5,
      2.4,
      0,
      tilesHigh - 0.3,
      back + 1.1,
      materials.wood,
    );
    const steel = gadgetVisuals.steel;
    for (const pit of ARENA.pits) {
      const deep = 2.4;
      box(scene, pit.width, 0.1, pit.depth, pit.x, -deep, pit.z, steel);
      for (const side of [-1, 1]) {
        box(
          scene,
          0.12,
          deep,
          pit.depth,
          pit.x + (side * pit.width) / 2,
          -deep / 2,
          pit.z,
          steel,
        );
        box(
          scene,
          pit.width,
          deep,
          0.12,
          pit.x,
          -deep / 2,
          pit.z + (side * pit.depth) / 2,
          steel,
        );
      }
      const water = new Mesh(
        new BoxGeometry(pit.width - 0.2, 0.05, pit.depth - 0.2),
        new MeshStandardMaterial({
          color: 0x4f8fa8,
          roughness: 0.08,
          metalness: 0.2,
          transparent: true,
          opacity: 0.78,
        }),
      );
      water.position.set(pit.x, -1.1, pit.z);
      scene.add(water);
      // A tap arching over from the back.
      const stem = cylinder(
        scene,
        0.28,
        3.6,
        pit.x,
        1.8,
        pit.z - pit.depth / 2 - 0.9,
        steel,
      );
      stem.castShadow = true;
      const spout = cylinder(
        scene,
        0.22,
        2.6,
        pit.x,
        3.5,
        pit.z - pit.depth / 2 + 0.3,
        steel,
      );
      spout.rotation.x = Math.PI / 2;
      for (const side of [-1, 1])
        cylinder(
          scene,
          0.3,
          0.5,
          pit.x + side * 1.5,
          0.25,
          pit.z - pit.depth / 2 - 0.9,
          steel,
        );
    }
  }
  scene.add(warning.root, people.root);
  let heldWeapon: WeaponId | undefined;
  let aimPreview: AimPreview | undefined;
  preloadWeaponModels();
  let disposed = false;
  function resize() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    applyShoulderOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const picker = new Raycaster();
  const pointer = new Vector2();
  const selection = new Mesh(
    new RingGeometry(0.68, 0.8, 48),
    new MeshBasicMaterial({
      color: 0xffe1a0,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  selection.rotation.x = -Math.PI / 2;
  scene.add(selection);
  // A team-coloured ring under every moth, so they are easy to find.
  const teamRingGeometry = new RingGeometry(0.5, 0.6, 40);
  const teamRings = ARENA.spawns.map(({ team }) => {
    const ring = new Mesh(
      teamRingGeometry,
      new MeshBasicMaterial({
        color: TEAM_COLOURS[team] ?? 0xffffff,
        side: DoubleSide,
        transparent: true,
        opacity: MOTH_LOOK.ring,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    return ring;
  });
  moths.forEach((moth, id) => {
    moth.root.userData.mothId = id;
  });
  return {
    resetCamera,
    /**
     * Where a weapon fired now would go: along the camera's view in the
     * shoulder camera, or the moth's facing in the board view, tilted up by
     * the aim offset so that the usual slightly-downward view aims level.
     */
    aimDirection(view: WorldView): Aim {
      const active = view.moths[view.selectedMoth];
      let yaw = active?.heading ?? 0;
      let pitch = AIM.boardPitch;
      if (cameraMode === 'follow') {
        const forward = controls.target.clone().sub(camera.position);
        if (forward.lengthSq() > 1e-6) {
          forward.normalize();
          yaw = Math.atan2(forward.x, forward.z);
          pitch = Math.asin(forward.y) + AIM.pitchOffset;
        }
      }
      pitch = Math.min(AIM.maxPitch, Math.max(AIM.minPitch, pitch));
      return {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch),
      };
    },
    /** Where sound is heard from: the point the camera is looking at. */
    listenerPosition() {
      const { x, y, z } = controls.target;
      return { x, y, z };
    },
    /**
     * Hold the camera on a spot on the desk; undefined lets it go back.
     * With `from` (where the giant stands), a corner inset shows them too.
     */
    /**
     * Sweep the camera round the desk: 0 is the start of the sweep and 1 the
     * end; undefined hands the camera back.
     */
    setFlyby(progress: number | undefined) {
      flyby =
        progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
    },
    setSpotlight(
      spot:
        { x: number; z: number; from?: { x: number; z: number } } | undefined,
    ) {
      spotlight = spot;
    },
    /** Whether the camera is over the moth's shoulder or above the board. */
    viewMode: () => cameraMode,
    /** Where the splat cam is drawn, for the frame laid over it. */
    insetRect,
    /** The weapon the moth whose go it is carries; none hides it. */
    setWeapon(weapon: WeaponId | undefined) {
      heldWeapon = weapon;
    },
    setAim(preview: AimPreview | undefined) {
      aimPreview = preview;
      weaponEffects.setAim(preview);
    },
    playEvents(events: WorldEvent[], view: WorldView) {
      if (!events.length) return;
      weaponEffects.play(events, view);
      for (const event of events)
        if (
          event.type === 'gust' ||
          event.type === 'launch' ||
          event.type === 'mind' ||
          (event.type === 'lamp' && event.zapper)
        ) {
          moths[view.selectedMoth]?.recoil();
          if (event.type === 'mind') people.enthral(event.person);
        } else if (event.type === 'bosh' && event.moth !== undefined)
          shake = Math.max(shake, BOSH.shake);
        else if (event.type === 'smack') shake = Math.max(shake, HAZARD.shake);
    },
    /** Float a short note above a spot on the desk, in a team's colour. */
    showNote(
      text: string,
      at: { x: number; y?: number; z: number },
      team: number,
    ) {
      weaponEffects.showNote(
        text,
        new Vector3(at.x, (at.y ?? 0) + 2.5, at.z),
        team,
      );
    },
    /** Mark each lamp that just scored with the team it scored for. */
    showScores(
      awards: readonly (number | undefined)[],
      view: WorldView,
      points: readonly number[] = [],
    ) {
      awards.forEach((team, index) => {
        const lamp = view.lamps[index];
        if (team === undefined || !lamp) return;
        weaponEffects.showScore(
          new Vector3(lamp.x, lamp.y + 1.5, lamp.z),
          team,
          points[index] ?? 1,
        );
      });
    },
    /** Switch between the shoulder camera and the whole-board view. */
    toggleView(): CameraMode {
      cameraMode = cameraMode === 'follow' ? 'board' : 'follow';
      resetCamera();
      return cameraMode;
    },
    get cameraMode() {
      return cameraMode;
    },
    movementDirection(x: number, z: number) {
      const backwards = camera.position
        .clone()
        .sub(controls.target)
        .setY(0)
        .normalize();
      return {
        x: backwards.z * x + backwards.x * z,
        z: -backwards.x * x + backwards.z * z,
      };
    },
    orbitCamera(x: number, y: number, deltaSeconds: number) {
      const flipX = CAMERA.invertX ? -1 : 1;
      const flipY = CAMERA.invertY ? -1 : 1;
      if (x !== 0)
        controls.rotateLeft(-x * flipX * deltaSeconds * CAMERA.stickSpeed);
      if (y !== 0)
        controls.rotateUp(-y * flipY * deltaSeconds * CAMERA.stickSpeed * 0.8);
    },
    pickMoth(clientX: number, clientY: number): number | undefined {
      // A pin under the pointer wins over anything in the 3D scene.
      for (const [index, pin] of pins.entries()) {
        if (pin.hidden) continue;
        const box = pin.getBoundingClientRect();
        if (
          clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom
        )
          return index;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      );
      picker.setFromCamera(pointer, camera);
      const hits = picker.intersectObjects(scene.children, true);
      for (const hit of hits) {
        if (
          !(hit.object instanceof Mesh) ||
          hit.object.material === haloMaterial ||
          hit.object === selection
        )
          continue;
        const object = hit.object;
        let mothId: number | undefined;
        let visible = true;
        // Stop at actual geometry so books correctly occlude moth selection.
        for (
          let parent: import('three').Object3D | null = object;
          parent;
          parent = parent.parent
        ) {
          visible &&= parent.visible;
          if (typeof parent.userData.mothId === 'number')
            mothId = parent.userData.mothId;
        }
        if (visible) return mothId;
      }
    },
    render(view: WorldView, seconds: number) {
      applySettings();
      updateFur();
      // Nearest lamps to the camera's focus get the shadow-casting lights.
      const focus = controls.target;
      const nearest = view.lamps
        .map((lamp, index) => ({
          index,
          distance: Math.hypot(lamp.x - focus.x, lamp.z - focus.z),
        }))
        .sort((a, b) => a.distance - b.distance);
      const lightFor = new Map(
        nearest.map(({ index }, rank) => [index, lampVisuals[rank]!.light]),
      );
      lampVisuals.forEach((visual, index) => {
        visual.light.visible = index < view.lamps.length;
      });
      lampVisuals.forEach((visual, index) => {
        const lamp = view.lamps[index];
        const {
          group,
          cord,
          cordGeometry,
          halo,
          cross,
          crossInk,
          glow,
          cage,
          ring,
        } = visual;
        const light = lightFor.get(index) ?? visual.light;
        group.visible = cord.visible = !!lamp;
        if (!lamp) {
          halo.visible = cross.visible = false;
          return;
        }
        const { anchor } = lamp;
        group.position.set(lamp.x, lamp.y, lamp.z);
        group.quaternion.setFromUnitVectors(
          new Vector3(0, 1, 0),
          new Vector3(
            anchor.x - lamp.x,
            anchor.y - lamp.y,
            anchor.z - lamp.z,
          ).normalize(),
        );
        const positions = cordGeometry.getAttribute('position');
        positions.setXYZ(0, anchor.x, anchor.y, anchor.z);
        positions.setXYZ(1, lamp.x, lamp.y, lamp.z);
        positions.needsUpdate = true;
        // A zapper is cold violet, buzzing with an uneven flicker.
        const flicker = lamp.zapper
          ? 0.75 + 0.25 * Math.sin(seconds * 47) * Math.sin(seconds * 13.3)
          : 1;
        light.color.setHex(lamp.zapper ? 0x9b7bff : 0xffc987);
        // A burnt-out lamp is nearly off; the hot lamp burns bright and pulses.
        const pulse = 1.35 + 0.25 * Math.sin(seconds * 5);
        const power = lamp.dark ? 0.06 : lamp.hot && !lamp.zapper ? pulse : 1;
        light.intensity = LIGHTING.lampIntensity * flicker * power;
        glow.emissive.setHex(lamp.zapper ? 0x8a5cff : 0xffb34b);
        // A burnt-out bulb is smoked glass, not just a dim one.
        glow.color.setHex(
          lamp.dark ? 0x2b2624 : lamp.zapper ? 0xe6dcff : 0xffefd0,
        );
        glow.emissiveIntensity = 3 * flicker * (lamp.dark ? 0.01 : power);
        cage.visible = lamp.zapper;
        ring.color.setHex(
          lamp.zapper
            ? 0xb48cff
            : lamp.dark
              ? 0xe2503a
              : lamp.hot
                ? 0xff9d2e
                : 0xedc778,
        );
        ring.opacity = lamp.zapper
          ? 0.85
          : lamp.dark
            ? 0.7
            : lamp.hot
              ? 0.55 + 0.3 * Math.sin(seconds * 5)
              : 0.48;
        light.angle = LIGHTING.lampAngle;
        light.position.set(lamp.x, lamp.y - 0.15, lamp.z);
        light.target.position.set(lamp.x, 0, lamp.z);
        const haloAtFloor = Math.sqrt(
          Math.max(0, LAMPS.haloRadius ** 2 - (lamp.y - lamp.base) ** 2),
        );
        halo.visible = haloAtFloor > 0;
        halo.scale.setScalar(haloAtFloor);
        halo.position.set(lamp.x, lamp.base + 0.012, lamp.z);
        cross.visible = lamp.dark && !lamp.zapper;
        cross.scale.setScalar(Math.max(1, haloAtFloor));
        cross.position.set(lamp.x, lamp.base + 0.03, lamp.z);
        crossInk.opacity = 0.65 + 0.2 * Math.sin(seconds * 3);
      });
      const frameDelta =
        lastSeconds === undefined ? 0 : Math.max(0, seconds - lastSeconds);
      weaponEffects.update(view, frameDelta);
      view.moths.forEach((position, index) => {
        const moth = moths[index];
        if (!moth) return;
        moth.root.visible = !position.respawning;
        moth.root.position.set(position.x, position.y, position.z);
        const mine = index === view.selectedMoth;
        moth.hold(mine ? heldWeapon : undefined);
        moth.aim(mine ? aimPreview?.power : undefined);
        moth.animate(seconds, position);
        const ring = teamRings[index];
        if (!ring) return;
        ring.visible = !position.respawning && !position.zapped;
        ring.material.opacity = MOTH_LOOK.ring;
        ring.position.set(
          position.x,
          position.y - ARENA.mothRadius + 0.03,
          position.z,
        );
      });
      warning.animate(seconds, view.hazards[0]);
      people.highlight(
        aimPreview?.weapon === 'mind' ? aimPreview.giant : undefined,
      );
      gadgetVisuals.update(view.gadgets, seconds);
      people.animate(
        seconds,
        frameDelta,
        view,
        camera.position,
        controls.target,
      );
      // The active moth's ring pulses.
      selection.scale.setScalar(1 + Math.sin(seconds * 5) * 0.08);
      const active = view.moths[view.selectedMoth];
      selection.visible = !!active && !active.respawning;
      if (active)
        selection.position.set(
          active.x,
          active.y - ARENA.mothRadius + 0.035,
          active.z,
        );
      const deltaSeconds =
        lastSeconds === undefined ? 0 : Math.max(0, seconds - lastSeconds);
      lastSeconds = seconds;
      const firstView = !lastView;
      lastView = view;
      // Orbit from the player's chosen position, not last frame's pulled-in one.
      if (unobstructed) camera.position.copy(unobstructed);
      unobstructed = undefined;
      if (flyby !== undefined) {
        // Before the match: sweep low round the front of the desk, from one
        // side to the other, closing in as it goes.
        if (!spotlit) {
          controls.minDistance = 1;
          controls.maxDistance = 420;
          camera.clearViewOffset();
        }
        spotlit = true;
        const t = flyby * flyby * (3 - 2 * flyby);
        const angle = -1.3 + t * 2.45;
        const reach = (255 - t * 115) * boardScale;
        controls.target.set(0, 2, homeTarget.z * 0.5);
        camera.position.set(
          Math.sin(angle) * reach,
          (118 - t * 70) * boardScale,
          controls.target.z + Math.cos(angle) * reach,
        );
      } else if (
        cameraMode === 'follow' &&
        !spotlight &&
        view.moths.some((moth) => moth.dance && !moth.respawning)
      ) {
        // A dance gets the camera: round to the front of the dancers, drifting
        // across them as the routine goes on. The shoulder view comes back
        // when the last of them stops.
        if (!spotlit) {
          controls.minDistance = 1;
          controls.maxDistance = 420;
        }
        spotlit = true;
        const dancers = view.moths.filter(
          (moth) => moth.dance && !moth.respawning,
        );
        const lead = dancers[0]!;
        const centre = new Vector3();
        for (const moth of dancers)
          centre.add(
            mothFocus(moth, new Vector3()).divideScalar(dancers.length),
          );
        const spread = Math.max(
          ...dancers.map((moth) =>
            Math.hypot(moth.x - centre.x, moth.z - centre.z),
          ),
        );
        // The Siuuu ends on a half turn, so that one is watched from behind:
        // the moth runs off, leaps and lands facing the camera.
        const front = lead.heading + (lead.dance === 3 ? Math.PI : 0) - 0.3;
        const reach = CAMERA.followDistance * 1.15 + spread * 1.6;
        const seat = (swing: number, lift: number) =>
          centre
            .clone()
            .add(
              new Vector3(
                Math.sin(front + swing) * reach,
                (CAMERA.followRise * 0.7 + spread * 0.5) * lift,
                Math.cos(front + swing) * reach,
              ),
            );
        // Once per routine, find a seat with nothing in the way: the front
        // first, then further round, then higher up.
        const key = `${lead.id}:${lead.dance}`;
        if (danceView?.key !== key) {
          danceView = { key, swing: 0, lift: 3.2 };
          search: for (const lift of [1, 2.2])
            for (const swing of [0, 0.7, -0.7, 1.4, -1.4, 2.3, -2.3, Math.PI])
              if (
                clearView(centre, seat(swing, lift)) &&
                clearView(centre, seat(swing + 0.5, lift))
              ) {
                danceView = { key, swing, lift };
                break search;
              }
        }
        const ease = 1 - Math.exp(-deltaSeconds * 6);
        // It drifts a little way round them as the routine goes on.
        const goal = seat(
          danceView.swing + (lead.danceTime / DANCE.seconds) * 0.5,
          danceView.lift,
        );
        danceCamera = (danceCamera ?? camera.position.clone()).lerp(goal, ease);
        controls.target.lerp(centre, ease);
        camera.position.copy(danceCamera);
      } else if (spotlight) {
        // Swing round to look down on the spot from the front of the desk.
        if (!spotlit) {
          controls.minDistance = 1;
          controls.maxDistance = 420;
        }
        spotlit = true;
        const ease = 1 - Math.exp(-deltaSeconds * 3.5);
        const goal = new Vector3(spotlight.x, 1, spotlight.z);
        controls.target.lerp(goal, ease);
        camera.position.lerp(goal.add(new Vector3(0, 13, 21)), ease);
      } else if (spotlit) {
        spotlit = false;
        danceCamera = undefined;
        danceView = undefined;
        resetCamera();
      } else if (cameraMode === 'follow' && active) {
        const switched = view.selectedMoth !== lastSelected;
        const returned = lastRespawning && !active.respawning;
        if (firstView || switched || returned) snapBehind();
        else if (!active.respawning) {
          // Carry the camera with the moth, keeping the player's chosen angle.
          const goal = mothFocus(active, new Vector3());
          const ease = 1 - Math.exp(-deltaSeconds * CAMERA.followEase);
          const shift = goal.sub(controls.target).multiplyScalar(ease);
          controls.target.add(shift);
          camera.position.add(shift);
        }
      }
      lastSelected = view.selectedMoth;
      lastRespawning = !!active?.respawning;
      controls.update();
      // Keep the shoulder camera in front of the back wall.
      if (camera.position.z < CAMERA.wallLimitZ)
        camera.position.z = CAMERA.wallLimitZ;
      if (cameraMode === 'follow' && !spotlight && !spotlit) {
        unobstructed = camera.position.clone();
        avoidOcclusion();
      }
      updatePins(view);
      shake = Math.max(0, shake - frameDelta * BOSH.shake * 4);
      shakeOffset.set(
        (Math.random() - 0.5) * 2 * shake,
        (Math.random() - 0.5) * 2 * shake,
        (Math.random() - 0.5) * 2 * shake,
      );
      camera.position.add(shakeOffset);
      if (!TILT_SHIFT.enabled) {
        renderer.render(scene, camera);
        camera.position.sub(shakeOffset);
        drawInset();
        return;
      }
      // Ease the focus band onto the active moth's height on screen.
      let goal = TILT_SHIFT.focus;
      if (TILT_SHIFT.followMoth && active && !active.respawning) {
        focusPoint.set(active.x, active.y, active.z).project(camera);
        goal = Math.min(0.95, Math.max(0.05, (focusPoint.y + 1) / 2));
      }
      focusLine += (goal - focusLine) * (1 - Math.exp(-deltaSeconds * 8));
      const size = renderer.getDrawingBufferSize(new Vector2());
      tiltShift.update({ ...TILT_SHIFT, focus: focusLine }, size.x, size.y);
      composer.render(deltaSeconds);
      camera.position.sub(shakeOffset);
      drawInset();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      controls.dispose();
      const geometries = new Set<BufferGeometry>();
      const usedMaterials = new Set<
        MeshStandardMaterial | MeshBasicMaterial | LineBasicMaterial
      >();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Line) {
          geometries.add(object.geometry);
          const list = Array.isArray(object.material)
            ? object.material
            : [object.material];
          list.forEach((material) => usedMaterials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      usedMaterials.forEach((material) => material.dispose());
      materials.dispose();
      lampVisuals.forEach(({ light }) => light.shadow.dispose());
      weaponEffects.destroy();
      pins.forEach((pin) => pin.remove());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
