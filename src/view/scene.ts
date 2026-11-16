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
  ARENA,
  CAMERA,
  LAMPS,
  LIGHTING,
  MAX_LAMPS,
  TILT_SHIFT,
} from '../config';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { createTiltShiftPasses } from './tiltShift';
import { updateFur } from './fur';
import type { BoxPiece, CylinderPiece } from '../config';
import type { MothView, WorldView } from '../game/world';

export type CameraMode = 'follow' | 'board';
import { createMaterials } from './materials';
import { createMoth } from './moth';

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
  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 260);
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
    ambient.intensity = LIGHTING.ambient;
    moon.intensity = LIGHTING.moon;
  }
  const homePosition = new Vector3(24, 36, 58);
  const homeTarget = new Vector3(0, 0.5, 0.5);
  // 'follow' sits behind the active moth's shoulder; 'board' shows the desk.
  let cameraMode: CameraMode = 'follow';
  let lastView: WorldView | undefined;
  let lastSelected = -1;
  let lastRespawning = false;
  let lastSeconds: number | undefined;
  const followTarget = new Vector3();
  function applyLimits() {
    const follow = cameraMode === 'follow';
    controls.minDistance = follow ? CAMERA.followMinDistance : 18;
    controls.maxDistance = follow ? CAMERA.followMaxDistance : 100;
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
    // Shift the frame so the moth sits left of centre, over its right shoulder.
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
  const moon = new SpotLight(0x9dbfe0, LIGHTING.moon, 70, 0.9, 1, 1.4);
  moon.position.set(-26, 18, -13);
  moon.target.position.set(-6, 0, 2);
  scene.add(moon, moon.target);

  const deskDepth = ARENA.desk.depth;
  const floorY = -7.5;
  const wallZ = -deskDepth / 2 - 1.5;
  const wallMaterial = new MeshStandardMaterial({
    color: 0x38484c,
    roughness: 1,
  });
  const wallStripe = new MeshStandardMaterial({
    color: 0x435154,
    roughness: 1,
  });
  box(scene, 110, 30, 0.2, 0, floorY + 15, wallZ, wallMaterial);
  box(scene, 110, 0.2, 75, 0, floorY, wallZ + 37, materials.wood);
  for (let x = -54; x < 55; x += 1.2)
    box(scene, 0.025, 30, 0.02, x, floorY + 15, wallZ + 0.12, wallStripe);
  box(scene, 110, 0.3, 0.2, 0, floorY + 0.15, wallZ + 0.15, cream);
  // Moonlit window and a simple framed print anchor the room behind the arena.
  const windowX = -18;
  box(scene, 5, 6, 0.15, windowX, 6, wallZ + 0.22, dark);
  const glass = new MeshStandardMaterial({
    color: 0x344f6c,
    emissive: 0x304a68,
    emissiveIntensity: 0.4,
    roughness: 0.3,
  });
  box(scene, 4.6, 5.6, 0.08, windowX, 6, wallZ + 0.33, glass);
  box(scene, 0.12, 5.6, 0.12, windowX, 6, wallZ + 0.43, cream);
  box(scene, 4.6, 0.12, 0.12, windowX, 6, wallZ + 0.43, cream);
  box(scene, 5.5, 0.18, 0.7, windowX, 2.95, wallZ + 0.4, cream);
  const moonDisc = new Mesh(
    new SphereGeometry(0.6, 24, 16),
    new MeshBasicMaterial({ color: 0xe5d9b4 }),
  );
  moonDisc.scale.z = 0.08;
  moonDisc.position.set(windowX - 1.1, 7.6, wallZ + 0.41);
  scene.add(moonDisc);
  box(scene, 2.8, 3.6, 0.12, 17, 6, wallZ + 0.22, brass);
  box(scene, 2.45, 3.25, 0.08, 17, 6, wallZ + 0.31, materials.felt(0x927d63));
  box(scene, 1.8, 1.8, 0.12, 21, 4.6, wallZ + 0.22, brass);
  box(scene, 1.55, 1.55, 0.08, 21, 4.6, wallZ + 0.31, materials.felt(0x6e8a7a));

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
      for (let j = 1; j < 5; j++) {
        box(
          scene,
          width - 0.2,
          0.008,
          0.012,
          x + nudge,
          bottom + 0.05 + (j * (bookHeight - 0.1)) / 5,
          z + depth / 2 - 0.04,
          brass,
        );
      }
    }
  }
  function drawBox(piece: BoxPiece) {
    const { x, y, z, width, height, depth, color } = piece;
    const top = y + height / 2;
    if (piece.kind === 'desk') {
      box(scene, width, height, depth, x, y, z, materials.wood);
      box(scene, width - 0.6, 0.9, depth - 0.6, x, -0.95, z, materials.wood);
      const legHeight = -1.4 - floorY;
      for (const legX of [-width / 2 + 0.8, width / 2 - 0.8])
        for (const legZ of [-depth / 2 + 0.8, depth / 2 - 0.8])
          box(
            scene,
            0.8,
            legHeight,
            0.8,
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
  for (const [x, z, turn, colour] of decor) {
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
  for (const [x, z] of [
    [19.6, -4.2],
    [20.1, -3.6],
    [-1.6, 7.4],
    [-24, 12],
  ] as const)
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
  // A fixed pool of lamps; the world decides how many are hanging.
  const lampVisuals = Array.from({ length: MAX_LAMPS }, () => {
    const group = new Group();
    const bulb = new Mesh(bulbGeometry, bulbMaterial);
    bulb.scale.y = 1.25;
    group.add(bulb);
    const socket = new Mesh(socketGeometry, brass);
    socket.position.y = 0.28;
    group.add(socket);
    const cordGeometry = new BufferGeometry().setFromPoints([
      new Vector3(),
      new Vector3(),
    ]);
    const cord = new Line(cordGeometry, cordMaterial);
    cord.frustumCulled = false;
    // This ring shows the halo's cross-section on the desk, not a score.
    const halo = new Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = -Math.PI / 2;
    // Each lamp casts its own shadows from a smaller map to stay inexpensive.
    const light = new SpotLight(
      0xffc987,
      LIGHTING.lampIntensity,
      45,
      1.25,
      0.75,
      1.4,
    );
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.035;
    light.shadow.camera.near = 0.3;
    light.shadow.camera.far = 45;
    scene.add(group, cord, halo, light, light.target);
    return { group, cord, cordGeometry, halo, light };
  });
  const moths = ARENA.spawns.map(({ color }, index) =>
    createMoth(materials, color, index),
  );
  moths.forEach((moth) => scene.add(moth.root));
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
    new RingGeometry(0.61, 0.65, 48),
    new MeshBasicMaterial({
      color: 0xffe1a0,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  selection.rotation.x = -Math.PI / 2;
  scene.add(selection);
  moths.forEach((moth, id) => {
    moth.root.userData.mothId = id;
  });
  return {
    resetCamera,
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
      lampVisuals.forEach((visual, index) => {
        const lamp = view.lamps[index];
        const { group, cord, cordGeometry, halo, light } = visual;
        group.visible = cord.visible = light.visible = !!lamp;
        if (!lamp) {
          halo.visible = false;
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
        light.intensity = LIGHTING.lampIntensity;
        light.angle = LIGHTING.lampAngle;
        light.position.set(lamp.x, lamp.y - 0.15, lamp.z);
        light.target.position.set(lamp.x, 0, lamp.z);
        const haloAtFloor = Math.sqrt(
          Math.max(0, LAMPS.haloRadius ** 2 - lamp.y ** 2),
        );
        halo.visible = haloAtFloor > 0;
        halo.scale.setScalar(haloAtFloor);
        halo.position.set(lamp.x, 0.012, lamp.z);
      });
      view.moths.forEach((position, index) => {
        const moth = moths[index];
        if (!moth) return;
        moth.root.visible = !position.respawning;
        moth.root.position.set(position.x, position.y, position.z);
        moth.animate(seconds, position);
      });
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
      if (cameraMode === 'follow' && active) {
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
      if (cameraMode === 'follow') {
        unobstructed = camera.position.clone();
        avoidOcclusion();
      }
      if (!TILT_SHIFT.enabled) {
        renderer.render(scene, camera);
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
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
