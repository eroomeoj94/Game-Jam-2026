import GUI from 'lil-gui';
import {
  CAMERA,
  FUR,
  LAMPS,
  LIGHTING,
  MAX_FUR_LAYERS,
  MAX_LAMPS,
  MOVEMENT,
  TILT_SHIFT,
} from '../config';

// Bump the version when defaults change shape, so stale saves are ignored.
const STORAGE_KEY = 'moth-fight-club:tuning:v3';
const SETTINGS = { MOVEMENT, CAMERA, LAMPS, LIGHTING, TILT_SHIFT, FUR };
type Settings = typeof SETTINGS;
const DEFAULTS: Settings = structuredClone(SETTINGS);

/** Copy saved or default values into the live config objects in place. */
function assign(source: Partial<Record<keyof Settings, unknown>>) {
  for (const key of Object.keys(SETTINGS) as (keyof Settings)[]) {
    const from = source[key];
    if (!from || typeof from !== 'object') continue;
    const target = SETTINGS[key] as Record<string, unknown>;
    for (const [name, value] of Object.entries(from)) {
      if (!(name in target)) continue;
      if (name === 'positions' && Array.isArray(value))
        value.slice(0, MAX_LAMPS).forEach((position, index) => {
          if (LAMPS.positions[index])
            Object.assign(LAMPS.positions[index], position);
        });
      else if (typeof value === typeof target[name]) target[name] = value;
    }
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SETTINGS));
  } catch {
    // Storage can be blocked; tuning still works for this session.
  }
}

/** Apply settings saved by a previous session, before the scene is built. */
export function loadSavedTuning() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) assign(JSON.parse(saved));
  } catch {
    // Ignore unreadable or blocked storage and keep the defaults.
  }
}

/**
 * A small playtesting panel. Most values apply live; lamp layout changes
 * rebuild the scene because lamps are physics bodies.
 */
export function createTuningPanel(actions: {
  rebuild: () => void;
  recentreCamera: () => void;
  nudgeLamps: () => void;
}) {
  const gui = new GUI({ title: 'Tuning' });
  gui.domElement.classList.add('tuning');
  const changed = () => save();
  const rebuild = () => {
    save();
    actions.rebuild();
  };
  const recentre = () => {
    save();
    actions.recentreCamera();
  };

  const movement = gui.addFolder('Movement');
  movement.add(MOVEMENT, 'speed', 1, 14, 0.1).name('Walk speed');
  movement.add(MOVEMENT, 'groundAcceleration', 5, 120, 1).name('Grip');
  movement.add(MOVEMENT, 'airAcceleration', 0, 60, 1).name('Air control');
  movement.add(MOVEMENT, 'airBrake', 0, 40, 0.5).name('Air brake');
  movement.add(MOVEMENT, 'jumpSpeed', 2, 14, 0.1).name('Hop power');
  movement.add(MOVEMENT, 'flutterSeconds', 0, 3, 0.05).name('Flutter time');
  movement
    .add(MOVEMENT, 'flutterAcceleration', 0, 50, 0.5)
    .name('Flutter lift');
  movement
    .add(MOVEMENT, 'maxFlutterRiseSpeed', 0, 12, 0.1)
    .name('Flutter max rise');
  movement.add(MOVEMENT, 'respawnDelay', 0, 3, 0.1).name('Respawn delay');

  const camera = gui.addFolder('Camera');
  camera.add(CAMERA, 'followDistance', 2, 22, 0.1).name('Distance behind');
  camera.add(CAMERA, 'followRise', 0, 8, 0.1).name('Height above');
  camera.add(CAMERA, 'followHeight', 0, 2, 0.05).name('Look-at height');
  camera.add(CAMERA, 'shoulderOffset', -0.3, 0.3, 0.01).name('Shoulder shift');
  camera.add(CAMERA, 'followEase', 1, 30, 0.5).name('Follow tightness');
  camera.add(CAMERA, 'fov', 25, 80, 1).name('Field of view');
  camera.add(CAMERA, 'stickSpeed', 0.3, 5, 0.1).name('Stick look speed');
  camera.add(CAMERA, 'invertX').name('Invert left/right');
  camera.add(CAMERA, 'invertY').name('Invert up/down');
  // Snap and framing values only show after the camera is re-placed.
  camera.onFinishChange(recentre);

  const lamps = gui.addFolder('Lamps (rebuilds scene)');
  lamps.add(LAMPS, 'count', 1, MAX_LAMPS, 1).name('Number of lamps');
  lamps.add(LAMPS, 'anchorHeight', 3, 16, 0.1).name('Ceiling height');
  lamps.add(LAMPS, 'tetherLength', 1, 10, 0.1).name('Cord length');
  lamps
    .add(LAMPS, 'haloRadius', 1, 14, 0.1)
    .name('Halo radius')
    .onFinishChange(changed);
  LAMPS.positions.forEach((position, index) => {
    const folder = lamps.addFolder(`Lamp ${index + 1} position`).close();
    folder.add(position, 'x', -28, 28, 0.1);
    folder.add(position, 'z', -15, 15, 0.1);
  });
  lamps.onFinishChange(({ property }) => {
    if (property !== 'haloRadius') rebuild();
  });

  const lighting = gui.addFolder('Lighting').close();
  lighting.add(LIGHTING, 'lampIntensity', 0, 800, 1).name('Lamp brightness');
  lighting.add(LIGHTING, 'lampAngle', 0.3, 1.5, 0.01).name('Lamp spread');
  lighting.add(LIGHTING, 'ambient', 0, 3, 0.05).name('Room light');
  lighting.add(LIGHTING, 'moon', 0, 400, 1).name('Moonlight');
  lighting.add(LIGHTING, 'exposure', 0.3, 3, 0.05).name('Exposure');
  lighting.add(LIGHTING, 'fog', 0, 0.05, 0.001).name('Fog');
  lighting.onFinishChange(changed);
  movement.onFinishChange(changed);

  const tilt = gui.addFolder('Tilt shift');
  tilt.add(TILT_SHIFT, 'enabled').name('On');
  tilt.add(TILT_SHIFT, 'strength', 0, 12, 0.1).name('Blur strength');
  tilt.add(TILT_SHIFT, 'band', 0, 0.5, 0.01).name('Sharp band size');
  tilt.add(TILT_SHIFT, 'followMoth').name('Focus on active moth');
  tilt.add(TILT_SHIFT, 'focus', 0, 1, 0.01).name('Fixed focus height');
  tilt.add(TILT_SHIFT, 'saturation', 0, 2, 0.01).name('Saturation');
  tilt.onFinishChange(changed);

  const fur = gui.addFolder('Fur').close();
  fur.add(FUR, 'layers', 1, MAX_FUR_LAYERS, 1).name('Shell layers');
  fur.add(FUR, 'length', 0, 0.2, 0.002).name('Length');
  fur.add(FUR, 'density', 5, 120, 1).name('Density');
  fur.add(FUR, 'thickness', 0.1, 1, 0.01).name('Strand thickness');
  fur.add(FUR, 'droop', 0, 1.5, 0.01).name('Droop');
  fur.add(FUR, 'rootShade', 0, 1, 0.01).name('Root shading');
  fur.onFinishChange(changed);

  const buttons = {
    nudge: actions.nudgeLamps,
    copy() {
      const text = JSON.stringify(SETTINGS, null, 2);
      navigator.clipboard?.writeText(text).catch(() => console.log(text));
    },
    reset() {
      assign(structuredClone(DEFAULTS));
      gui.controllersRecursive().forEach((item) => item.updateDisplay());
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing saved to clear.
      }
      actions.rebuild();
      actions.recentreCamera();
    },
  };
  gui.add(buttons, 'nudge').name('Nudge the lamps');
  gui.add(buttons, 'copy').name('Copy settings as JSON');
  gui.add(buttons, 'reset').name('Reset to defaults');
  return {
    destroy() {
      gui.destroy();
    },
  };
}
