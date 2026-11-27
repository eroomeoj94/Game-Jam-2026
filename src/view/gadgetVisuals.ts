import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Scene } from 'three';
import type { GadgetView, PartView } from '../game/contraptions';
import { fitProp, isProp } from './props';
import type { Bounds, PropName } from './props';
import type { createMaterials } from './materials';

type Materials = ReturnType<typeof createMaterials>;

/** A stand-in shape that gives way to the real model when it has loaded. */
function withProp(
  holder: Group,
  name: string,
  bounds: Bounds,
  placeholder: Mesh,
  turn = 0,
) {
  placeholder.castShadow = placeholder.receiveShadow = true;
  holder.add(placeholder);
  if (!isProp(name)) return;
  void fitProp(name as PropName, bounds).then((model) => {
    if (!model) return;
    const turned = new Group();
    turned.rotation.y = turn;
    turned.add(model);
    holder.add(turned);
    placeholder.visible = false;
  });
}

const place = (group: Group, part: PartView) => {
  group.position.set(part.x, part.y, part.z);
  group.quaternion.set(...part.q);
};

/**
 * Draws whatever on the level moves or reacts, from the world's view of it
 * each frame: one visual per contraption, built the first time it is seen.
 */
export function createGadgetVisuals(scene: Scene, materials: Materials) {
  const root = new Group();
  scene.add(root);
  const steel = new MeshStandardMaterial({
    color: 0xb9c0c4,
    roughness: 0.35,
    metalness: 0.7,
  });
  const puff = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const puffShape = new SphereGeometry(1, 10, 8);
  const visuals: Array<(view: GadgetView, seconds: number) => void> = [];

  function build(
    first: GadgetView,
  ): (view: GadgetView, seconds: number) => void {
    const group = new Group();
    root.add(group);
    if (first.type === 'blower') {
      const size = {
        width: first.radius * 2,
        height: first.height,
        depth: first.radius * 2,
      };
      const body = new Group();
      body.position.y = first.height / 2;
      group.add(body);
      if (first.kind === 'fan')
        withProp(
          body,
          'fan',
          // The fan is as wide as it is tall, and thin.
          { width: first.height, height: first.height, depth: first.height },
          new Mesh(
            new CylinderGeometry(first.radius, first.radius, first.height, 16),
            materials.felt(0x9fd6c4),
          ),
        );
      else
        withProp(
          body,
          'kettle',
          size,
          new Mesh(
            new CylinderGeometry(first.radius, first.radius, first.height, 16),
            materials.felt(0xc0392b),
          ),
          // The spout is on the model's left; turn it to the front.
          Math.PI / 2,
        );
      // What it blows: a stream of puffs that fade as they travel.
      const puffs = Array.from({ length: 9 }, () => {
        const mesh = new Mesh(puffShape, puff.clone());
        group.add(mesh);
        return mesh;
      });
      return (view, seconds) => {
        if (view.type !== 'blower') return;
        group.position.set(view.x, 0, view.z);
        group.rotation.y = view.heading;
        const mouth =
          view.kind === 'fan' ? view.height * 0.6 : view.height * 0.72;
        puffs.forEach((mesh, index) => {
          const travel = (seconds * 0.9 + index / puffs.length) % 1;
          mesh.visible = view.strength > 0.02;
          mesh.position.set(
            Math.sin(index * 2.4 + seconds * 3) * view.radius * (0.4 + travel),
            mouth + Math.sin(index * 1.7) * 0.4 + travel * 0.6,
            view.radius + travel * view.range * 0.8,
          );
          mesh.scale.setScalar(
            (view.kind === 'fan' ? 0.22 : 0.4) * (0.6 + travel * 2.2),
          );
          (mesh.material as MeshBasicMaterial).opacity =
            (view.kind === 'fan' ? 0.16 : 0.42) * view.strength * (1 - travel);
        });
      };
    }
    if (first.type === 'launcher') {
      group.position.set(first.x, 0, first.z);
      group.rotation.y = first.heading;
      if (first.kind === 'toaster') {
        const body = new Group();
        body.position.y = first.height / 2;
        group.add(body);
        withProp(
          body,
          'toaster',
          { width: first.width, height: first.height, depth: first.depth },
          new Mesh(
            new BoxGeometry(first.width, first.height, first.depth),
            materials.felt(0xe9dfc6),
          ),
        );
        const toast = [-1, 1].map((side) => {
          const slice = new Mesh(
            new BoxGeometry(first.width * 0.62, first.height * 0.6, 0.16),
            materials.felt(0xc98a4b),
          );
          slice.position.z = side * first.depth * 0.17;
          slice.castShadow = true;
          group.add(slice);
          return slice;
        });
        return (view, seconds) => {
          if (view.type !== 'launcher') return;
          // It trembles before it goes, then the toast leaps and settles.
          body.position.x = Math.sin(seconds * 60) * 0.035 * view.armed;
          const leap = Math.max(0, 1 - view.sincePop / 0.9);
          toast.forEach((slice) => {
            slice.position.y =
              view.height * 0.55 + Math.sin(leap * Math.PI) * view.height * 0.9;
          });
        };
      }
      const pivot = new Mesh(
        new CylinderGeometry(0.34, 0.34, first.width * 0.9, 12),
        materials.wood,
      );
      pivot.rotation.z = Math.PI / 2;
      pivot.position.y = 0.3;
      pivot.castShadow = true;
      group.add(pivot);
      const plank = new Group();
      plank.position.y = first.height - 0.08;
      group.add(plank);
      const ruler = new Mesh(
        new BoxGeometry(first.width, 0.14, first.depth),
        materials.felt(0xe8c15a),
      );
      ruler.castShadow = ruler.receiveShadow = true;
      plank.add(ruler);
      // Inch marks along one edge.
      for (let mark = -4; mark <= 4; mark++) {
        const tick = new Mesh(
          new BoxGeometry(first.width * (mark % 2 ? 0.25 : 0.4), 0.02, 0.05),
          new MeshBasicMaterial({ color: 0x4a3a1c }),
        );
        tick.position.set(
          first.width * 0.28,
          0.08,
          (mark / 4.6) * (first.depth / 2),
        );
        plank.add(tick);
      }
      let lean = first.tilt;
      return (view) => {
        if (view.type !== 'launcher') return;
        lean += (view.tilt - lean) * 0.35;
        plank.rotation.x = lean * 0.2;
      };
    }
    if (first.type === 'runner') {
      const body = new Group();
      body.position.y = first.height / 2;
      group.add(body);
      withProp(
        body,
        first.kind,
        // The models lie along x; the runner drives along z.
        { width: first.length, height: first.height, depth: first.width },
        new Mesh(
          new BoxGeometry(first.width, first.height, first.length),
          materials.felt(first.kind === 'mouse' ? 0x8d8d8d : 0xc0392b),
        ),
        // The car's nose is at +x and the mouse's at -x.
        first.kind === 'car' ? -Math.PI / 2 : Math.PI / 2,
      );
      return (view, seconds) => {
        if (view.type !== 'runner') return;
        group.position.set(view.x, 0, view.z);
        group.rotation.y = view.heading;
        if (view.kind === 'apple') {
          // Rolling, not driving.
          body.rotation.x = seconds * 7.5;
          return;
        }
        // A clockwork rattle.
        body.position.y =
          view.height / 2 + Math.abs(Math.sin(seconds * 22)) * 0.03;
      };
    }
    if (first.type === 'roller') {
      // The body's own long axis is y, as a cylinder's is.
      if (first.kind === 'pin') {
        const holder = new Group();
        holder.rotation.z = Math.PI / 2;
        group.add(holder);
        withProp(
          holder,
          'pin',
          {
            width: first.length,
            height: first.radius * 2,
            depth: first.radius * 2,
          },
          new Mesh(
            new CylinderGeometry(first.radius, first.radius, first.length, 14),
            materials.wood,
          ),
        );
        // The stand-in is already upright along y: undo the holder's turn.
        holder.children[0]!.rotation.z = -Math.PI / 2;
      } else {
        const shaft = new Mesh(
          new CylinderGeometry(
            first.radius,
            first.radius,
            first.length * 0.86,
            6,
          ),
          materials.felt(0xe8b830),
        );
        shaft.castShadow = true;
        const tip = new Mesh(
          new CylinderGeometry(0.02, first.radius, first.length * 0.1, 6),
          materials.wood,
        );
        tip.position.y = first.length * 0.48;
        const rubber = new Mesh(
          new CylinderGeometry(
            first.radius,
            first.radius,
            first.length * 0.05,
            8,
          ),
          materials.felt(0xd98a96),
        );
        rubber.position.y = -first.length * 0.455;
        group.add(shaft, tip, rubber);
      }
      return (view) => {
        if (view.type !== 'roller') return;
        group.visible = view.present;
        place(group, view);
      };
    }
    if (first.type === 'spill') {
      group.position.set(first.x, 0, first.z);
      // Hinged at the foot, so it falls over rather than through the surface.
      const hinge = new Group();
      group.add(hinge);
      const body = new Group();
      body.position.y = first.height / 2;
      hinge.add(body);
      withProp(
        body,
        first.kind,
        {
          width: first.radius * 2,
          height: first.height,
          depth: first.radius * 2,
        },
        new Mesh(
          new CylinderGeometry(first.radius, first.radius, first.height, 16),
          materials.felt(first.kind === 'mug' ? 0xa37a58 : 0xf4f1e8),
        ),
      );
      const puddle = new Mesh(
        new CircleGeometry(1, 40),
        new MeshStandardMaterial({
          color: first.color,
          roughness: 0.08,
          metalness: 0.25,
          transparent: true,
          opacity: 0.92,
        }),
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.receiveShadow = true;
      puddle.visible = false;
      root.add(puddle);
      let fallen = 0;
      return (view) => {
        if (view.type !== 'spill') return;
        fallen += ((view.tipped ? 1 : 0) - fallen) * 0.25;
        group.rotation.y = view.heading;
        hinge.rotation.x = fallen * (Math.PI / 2);
        hinge.position.y = fallen * view.radius;
        puddle.visible = view.puddle.radius > 0.05;
        puddle.position.set(view.puddle.x, 0.025, view.puddle.z);
        // A little ragged, not a perfect disc.
        puddle.scale.set(view.puddle.radius, view.puddle.radius * 0.86, 1);
        puddle.rotation.z = view.heading;
      };
    }
    // A stack: one mesh for each level, standing or wherever it has fallen.
    const cream = materials.felt(0xe9e2cf);
    const levels = Array.from({ length: first.levels }, (_, level) => {
      const part = new Group();
      if (first.kind === 'plates') {
        const plate = new Mesh(
          new CylinderGeometry(
            first.width / 2,
            first.width * 0.3,
            first.levelHeight * 0.8,
            24,
          ),
          new MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.3 }),
        );
        const rim = new Mesh(
          new CylinderGeometry(
            first.width / 2 + 0.01,
            first.width / 2 + 0.01,
            0.04,
            24,
          ),
          new MeshStandardMaterial({ color: 0x3f5d87, roughness: 0.4 }),
        );
        rim.position.y = first.levelHeight * 0.38;
        plate.castShadow = plate.receiveShadow = true;
        part.add(plate, rim);
      } else {
        const pages = new Mesh(
          new BoxGeometry(
            first.width - 0.1,
            first.levelHeight - 0.1,
            first.depth - 0.12,
          ),
          cream,
        );
        const cover = new Mesh(
          new BoxGeometry(first.width, first.levelHeight * 0.9, first.depth),
          materials.felt(level % 2 ? first.color : 0x8a7a3e),
        );
        cover.scale.set(1, 1, 1);
        // The cover wraps the pages on three sides: nudge the pages out.
        pages.position.x = 0.07;
        pages.scale.y = 0.86;
        cover.castShadow = cover.receiveShadow = true;
        part.add(cover, pages);
        pages.position.z = 0.02;
        pages.scale.set(1.01, 0.8, 1.01);
      }
      group.add(part);
      return part;
    });
    return (view) => {
      if (view.type !== 'topple') return;
      levels.forEach((part, level) => {
        if (!view.fallen) {
          part.visible = true;
          part.position.set(
            view.x + (level % 2 ? 0.05 : -0.04),
            (level + 0.5) * view.levelHeight,
            view.z,
          );
          part.quaternion.identity();
          return;
        }
        const loose = view.parts[level];
        part.visible = !!loose;
        if (loose) place(part, loose);
      });
    };
  }

  return {
    update(gadgets: readonly GadgetView[] | undefined, seconds: number) {
      (gadgets ?? []).forEach((gadget, index) => {
        visuals[index] ??= build(gadget);
        visuals[index]!(gadget, seconds);
      });
    },
    /** Something steel-looking for whoever builds the kitchen sink. */
    steel,
  };
}
