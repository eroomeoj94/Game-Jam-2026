import {
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { FUR } from '../config';
import type { MothView } from '../game/world';
import { createFurShells } from './fur';
import type { createMaterials } from './materials';

export function createMoth(
  materials: ReturnType<typeof createMaterials>,
  color: number,
  team: number,
) {
  const root = new Group();
  const puppet = new Group();
  root.add(puppet);
  const cream = materials.felt(0xd3b993);
  const wingMaterial = materials.felt(color);
  const dark = new MeshStandardMaterial({ color: 0x211b1c, roughness: 0.22 });
  const stitches = new MeshStandardMaterial({ color: 0xe6cc9b, roughness: 1 });
  const gloveMaterial = materials.felt(team === 0 ? 0x963e32 : 0x624871);
  const sphere = new SphereGeometry(1, 24, 16);
  function ball(
    parent: Group,
    material: MeshStandardMaterial,
    size: [number, number, number],
    position: [number, number, number],
  ) {
    const mesh = new Mesh(sphere, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.position.set(side * 0.18, 0.1, -0.12);
    wing.rotation.z = side * -0.3;
    ball(wing, wingMaterial, [0.45, 0.57, 0.1], [side * 0.35, 0.1, 0]);
    ball(wing, wingMaterial, [0.33, 0.31, 0.11], [side * 0.28, -0.25, 0.025]);
    ball(
      wing,
      gloveMaterial,
      [0.16, team === 0 ? 0.19 : 0.08, 0.025],
      [side * 0.44, 0.18, 0.1],
    );
    ball(wing, cream, [0.065, 0.075, 0.025], [side * 0.44, 0.18, 0.125]);
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const stitch = ball(
        wing,
        stitches,
        [0.012, 0.028, 0.012],
        [
          side * (0.35 + Math.cos(angle) * 0.36),
          0.1 + Math.sin(angle) * 0.48,
          0.07,
        ],
      );
      stitch.rotation.z = -side * angle;
    }
    puppet.add(wing);
    wings.push(wing);
  }
  const body = ball(puppet, cream, [0.29, 0.43, 0.25], [0, -0.02, 0]);
  const head = ball(puppet, cream, [0.34, 0.29, 0.28], [0, 0.3, 0.04]);
  for (const side of [-1, 1]) {
    ball(puppet, cream, [0.13, 0.08, 0.2], [side * 0.15, -0.42, 0.1]);
    ball(puppet, dark, [0.085, 0.1, 0.065], [side * 0.14, 0.33, 0.29]);
    ball(
      puppet,
      stitches,
      [0.023, 0.027, 0.013],
      [side * 0.14 - 0.02, 0.36, 0.35],
    );
    const brow = ball(
      puppet,
      gloveMaterial,
      [0.13, 0.035, 0.04],
      [side * 0.14, 0.46, 0.28],
    );
    brow.rotation.z = side * 0.25;
    ball(puppet, cream, [0.23, 0.07, 0.07], [side * 0.3, -0.02, 0.15]);
    ball(puppet, gloveMaterial, [0.19, 0.2, 0.17], [side * 0.43, -0.025, 0.27]);
    ball(puppet, gloveMaterial, [0.09, 0.11, 0.1], [side * 0.31, -0.025, 0.34]);
    const curve = new CatmullRomCurve3([
      new Vector3(side * 0.16, 0.52, 0),
      new Vector3(side * 0.23, 0.75, -0.02),
      new Vector3(side * 0.38, 0.85, 0.04),
    ]);
    const antenna = new Mesh(
      new TubeGeometry(curve, 10, 0.014, 5, false),
      dark,
    );
    puppet.add(antenna);
    ball(puppet, cream, [0.065, 0.085, 0.055], [side * 0.38, 0.85, 0.04]);
  }
  // Shell-textured fur over the body and head; the solid felt is the root.
  const shells = [body, head].map((part) => {
    const fur = createFurShells(sphere, cream);
    fur.position.copy(part.position);
    fur.scale.copy(part.scale);
    puppet.add(fur);
    return fur;
  });
  root.rotation.y = team === 0 ? 0.3 : -0.3;
  return {
    root,
    animate(seconds: number, state: MothView) {
      const steppedTime = Math.floor(seconds * 10) / 10;
      root.rotation.y = state.heading;
      for (const fur of shells) fur.count = FUR.layers;
      const walking = state.moving && state.grounded;
      puppet.rotation.z =
        Math.sin(steppedTime * (walking ? 16 : 1.8) + team) *
        (walking ? 0.075 : 0.025);
      puppet.position.y = walking
        ? Math.abs(Math.sin(steppedTime * 16)) * 0.04
        : 0;
      puppet.rotation.x = !state.grounded && state.moving ? 0.16 : 0;
      wings.forEach((wing, index) => {
        wing.rotation.y =
          (index === 0 ? -1 : 1) *
          (state.fluttering
            ? 0.35 + Math.sin(steppedTime * 28) * 0.8
            : 0.15 + Math.sin(steppedTime * 3 + team) * 0.08);
      });
    },
  };
}
