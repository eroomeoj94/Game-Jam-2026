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
  RingGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARENA } from '../config';
import type { WorldView } from '../game/world';
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
  scene.fog = new FogExp2(0x101922, 0.025);
  const camera = new PerspectiveCamera(38, 1, 0.1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 23;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.43;
  controls.minAzimuthAngle = -0.85;
  controls.maxAzimuthAngle = 0.85;
  const homePosition = new Vector3(9.8, 8.4, 15.8);
  function resetCamera() {
    camera.position.copy(homePosition);
    controls.target.set(0, 1.15, 0);
    controls.update();
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
    return mesh;
  }
  scene.add(new HemisphereLight(0xb7d0df, 0x775441, 1.15));
  // One shadow-casting spotlight keeps the miniature lighting inexpensive.
  const light = new SpotLight(0xffc987, 100, 22, 1.15, 0.75, 1.5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 0.035;
  light.shadow.camera.near = 0.3;
  light.shadow.camera.far = 20;
  scene.add(light, light.target);
  const moon = new SpotLight(0x9dbfe0, 70, 26, 0.8, 1, 1.5);
  moon.position.set(-7, 7, -3);
  moon.target.position.set(0, 0, 1);
  scene.add(moon, moon.target);

  const wallMaterial = new MeshStandardMaterial({
    color: 0x38484c,
    roughness: 1,
  });
  box(scene, 24, 12, 0.2, 0, 3.5, -5, wallMaterial);
  box(scene, 24, 0.2, 18, 0, -3.5, 0, materials.wood);
  for (let x = -11; x < 12; x += 0.65) {
    box(
      scene,
      0.018,
      10,
      0.02,
      x,
      3.5,
      -4.88,
      new MeshStandardMaterial({ color: 0x435154, roughness: 1 }),
    );
  }
  box(scene, 24, 0.18, 0.15, 0, -0.8, -4.85, cream);
  // Moonlit window and a simple framed print anchor the room behind the arena.
  box(scene, 3, 3.6, 0.15, -5, 3.4, -4.78, dark);
  const glass = new MeshStandardMaterial({
    color: 0x344f6c,
    emissive: 0x304a68,
    emissiveIntensity: 0.4,
    roughness: 0.3,
  });
  box(scene, 2.7, 3.3, 0.08, -5, 3.4, -4.67, glass);
  box(scene, 0.09, 3.3, 0.12, -5, 3.4, -4.57, cream);
  box(scene, 2.7, 0.09, 0.12, -5, 3.4, -4.57, cream);
  box(scene, 3.3, 0.12, 0.5, -5, 1.55, -4.6, cream);
  const moonDisc = new Mesh(
    new SphereGeometry(0.36, 24, 16),
    new MeshBasicMaterial({ color: 0xe5d9b4 }),
  );
  moonDisc.scale.z = 0.08;
  moonDisc.position.set(-5.65, 4.3, -4.59);
  scene.add(moonDisc);
  box(scene, 1.7, 2.2, 0.12, 4.6, 3.2, -4.78, brass);
  box(scene, 1.45, 1.95, 0.08, 4.6, 3.2, -4.69, materials.felt(0x927d63));

  for (const [index, terrain] of ARENA.terrain.entries()) {
    const { x, y, z, width, height, depth, color } = terrain;
    if (index === 0) {
      box(scene, width, height, depth, x, y, z, materials.wood);
      box(scene, width - 0.3, 0.85, depth - 0.35, x, -0.85, z, materials.wood);
      for (const legX of [-5.9, 5.9]) {
        for (const legZ of [-2.8, 2.8])
          box(scene, 0.48, 3, 0.48, legX, -1.9, legZ, materials.wood);
      }
      continue;
    }
    const cover = materials.felt(color);
    const levels = index === 1 ? 2 : 3;
    const bookHeight = height / levels;
    for (let i = 0; i < levels; i++) {
      const bottom = y - height / 2 + i * bookHeight;
      box(
        scene,
        width - 0.08,
        bookHeight - 0.08,
        depth - 0.1,
        x,
        bottom + bookHeight / 2,
        z,
        cream,
      );
      box(scene, width, 0.04, depth, x, bottom + 0.02, z, cover);
      box(scene, width, 0.04, depth, x, bottom + bookHeight - 0.02, z, cover);
      box(
        scene,
        0.08,
        bookHeight,
        depth,
        x - width / 2 + 0.04,
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
          x,
          bottom + 0.05 + (j * (bookHeight - 0.1)) / 5,
          z + depth / 2 - 0.04,
          brass,
        );
      }
    }
  }
  // Decorative objects sit behind the playable area; they have no colliders yet.
  const mug = new Group();
  mug.position.set(5.3, 0.7, -2.2);
  const ceramic = new MeshStandardMaterial({
    color: 0xa37a58,
    roughness: 0.6,
    side: DoubleSide,
  });
  const cup = new Mesh(
    new CylinderGeometry(0.55, 0.45, 1.35, 32, 1, true),
    ceramic,
  );
  cup.castShadow = true;
  mug.add(cup);
  const rim = new Mesh(new TorusGeometry(0.55, 0.045, 8, 32), ceramic);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.675;
  mug.add(rim);
  const tea = new Mesh(new CylinderGeometry(0.5, 0.5, 0.025, 24), dark);
  tea.position.y = 0.45;
  mug.add(tea);
  const handle = new Mesh(new TorusGeometry(0.35, 0.09, 8, 20), ceramic);
  handle.position.x = 0.55;
  mug.add(handle);
  scene.add(mug);
  const pencil = new Mesh(
    new CylinderGeometry(0.065, 0.065, 2.9, 6),
    materials.felt(0xc19142),
  );
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = -0.3;
  pencil.position.set(-4, 0.07, -2.7);
  pencil.castShadow = true;
  scene.add(pencil);
  const spool = new Group();
  spool.position.set(-5.6, 0.35, -1.4);
  const thread = new Mesh(
    new CylinderGeometry(0.3, 0.3, 0.65, 24),
    materials.felt(0x9f6051),
  );
  spool.add(thread);
  for (const y of [-0.3, 0.3]) {
    const end = new Mesh(
      new CylinderGeometry(0.4, 0.4, 0.06, 24),
      materials.wood,
    );
    end.position.y = y;
    spool.add(end);
  }
  scene.add(spool);

  const lampGroup = new Group();
  const bulb = new Mesh(
    new SphereGeometry(ARENA.lampRadius, 24, 16),
    new MeshStandardMaterial({
      color: 0xffefd0,
      emissive: 0xffb34b,
      emissiveIntensity: 3,
      roughness: 0.3,
    }),
  );
  bulb.scale.y = 1.25;
  lampGroup.add(bulb);
  const socket = new Mesh(new CylinderGeometry(0.11, 0.13, 0.24, 16), brass);
  socket.position.y = 0.28;
  lampGroup.add(socket);
  scene.add(lampGroup);
  const cordGeometry = new BufferGeometry().setFromPoints([
    new Vector3(),
    new Vector3(),
  ]);
  const cord = new Line(
    cordGeometry,
    new LineBasicMaterial({ color: 0x372b24 }),
  );
  cord.frustumCulled = false;
  scene.add(cord);
  // This ring shows the proposed halo's cross-section on the desk, not a score.
  const halo = new Mesh(
    new RingGeometry(0.985, 1, 96),
    new MeshBasicMaterial({
      color: 0xedc778,
      transparent: true,
      opacity: 0.48,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  scene.add(halo);
  const moths = ARENA.spawns.map(({ color }, index) =>
    createMoth(materials, color, index),
  );
  moths.forEach((moth) => scene.add(moth.root));
  let disposed = false;
  function resize() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return {
    resetCamera,
    render(view: WorldView, seconds: number) {
      lampGroup.position.set(view.lamp.x, view.lamp.y, view.lamp.z);
      const towardsAnchor = new Vector3(
        ARENA.anchor.x - view.lamp.x,
        ARENA.anchor.y - view.lamp.y,
        ARENA.anchor.z - view.lamp.z,
      ).normalize();
      lampGroup.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        towardsAnchor,
      );
      const positions = cordGeometry.getAttribute('position');
      positions.setXYZ(0, ARENA.anchor.x, ARENA.anchor.y, ARENA.anchor.z);
      positions.setXYZ(1, view.lamp.x, view.lamp.y, view.lamp.z);
      positions.needsUpdate = true;
      light.position.set(view.lamp.x, view.lamp.y - 0.15, view.lamp.z);
      light.target.position.set(view.lamp.x, 0, view.lamp.z);
      const haloAtFloor = Math.sqrt(
        Math.max(0, ARENA.haloRadius ** 2 - view.lamp.y ** 2),
      );
      halo.visible = haloAtFloor > 0;
      halo.scale.setScalar(haloAtFloor);
      halo.position.set(view.lamp.x, 0.012, view.lamp.z);
      view.moths.forEach((position, index) => {
        const moth = moths[index];
        if (!moth) return;
        moth.root.position.set(position.x, position.y, position.z);
        moth.animate(seconds);
      });
      controls.update();
      renderer.render(scene, camera);
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
      light.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
