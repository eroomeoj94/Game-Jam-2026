import GUI from 'lil-gui';
import {
  AIM,
  ARENA,
  AUDIO,
  BOSH,
  CAMERA,
  CAP,
  FIRECRACKER,
  FUR,
  GUST,
  HAZARD,
  LAMPS,
  LIGHTING,
  MATCH,
  MAX_FUR_LAYERS,
  MAX_LAMPS,
  MOVEMENT,
  PEOPLE,
  PLAYGROUND,
  TILT_SHIFT,
  ZAP,
} from '../config';

// Bump the version when defaults change shape, so stale saves are ignored.
const STORAGE_KEY = 'moth-fight-club:tuning:v15';
const SETTINGS = {
  MOVEMENT,
  CAMERA,
  LAMPS,
  LIGHTING,
  TILT_SHIFT,
  FUR,
  GUST,
  BOSH,
  ZAP,
  CAP,
  FIRECRACKER,
  AIM,
  PLAYGROUND,
  AUDIO,
  MATCH,
  HAZARD,
  PEOPLE,
};
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
  /** Bring a giant hand down on the active moth. */
  smack: () => void;
}) {
  const gui = new GUI({ title: 'Tuning' });
  // Collapsed until wanted, so it never covers the game's own buttons.
  gui.close();
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
    folder.add(position, 'x', -ARENA.desk.width / 2, ARENA.desk.width / 2, 0.5);
    folder.add(position, 'z', -ARENA.desk.depth / 2, ARENA.desk.depth / 2, 0.5);
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

  // Match rules apply from the next turn; a new match resets the score.
  const rules = gui.addFolder('Match rules').close();
  rules.add(MATCH, 'targetScore', 1, 30, 1).name('Points to win');
  rules
    .add(MATCH, 'moveSeconds', 0, 15, 0.5)
    .name('Move time (s, 0 = no limit)');
  rules.add(MATCH, 'resolveSeconds', 0, 6, 0.1).name('Shortest resolve (s)');
  rules.add(MATCH, 'zapSwitches', 0, 6, 1).name('Zap Switches each');
  rules.add(MATCH, 'zapperTurns', 1, 6, 1).name('Zapper lasts (turns)');
  rules.add(MATCH, 'restRounds', 0, 3, 1).name('Rounds sat out');
  rules.add(MATCH, 'roundSmack').name('Hand swats busiest lamp');
  rules.add(MATCH, 'burnOut').name('Camped lamps burn out');
  rules.add(MATCH, 'burnAfter', 2, 4, 1).name('Burn out after (pays)');
  rules.add(MATCH, 'hotLamp').name('Hot lamp each round');
  rules.add(MATCH, 'hotPoints', 2, 4, 1).name('Hot lamp pays');
  rules
    .add(MATCH, 'scoring', {
      'After rival’s turn': 'incoming',
      'End of round': 'round',
    })
    .name('Lamps score');
  rules.onFinishChange(changed);

  const hands = gui.addFolder('Giant hands').close();
  hands.add(HAZARD, 'minGap', 0, 20, 0.5).name('Shortest wait (s)');
  hands.add(HAZARD, 'maxGap', 0, 30, 0.5).name('Longest wait (s)');
  hands.add(HAZARD, 'warnSeconds', 0.3, 4, 0.1).name('Warning (s)');
  hands.add(HAZARD, 'lampBias', 0, 1, 0.05).name('Aims at lamps');
  hands.add(HAZARD, 'force', 0, 30, 0.5).name('Knockback');
  hands.add(HAZARD, 'lift', 0, 15, 0.1).name('Lift');
  hands.add(HAZARD, 'lampForce', 0, 10, 0.1).name('Lamp jolt');
  hands.add(HAZARD, 'shake', 0, 2, 0.01).name('Screen shake');
  hands.add(HAZARD, 'loudness', 0, 6, 0.1).name('Loudness');
  hands.add(PEOPLE, 'speed', 0, 15, 0.5).name('Walking speed');
  hands.add(PEOPLE, 'turnsPerSecond', 0, 0.5, 0.01).name('Turn-backs per s');
  hands.onFinishChange(changed);

  const weapons = gui.addFolder('Weapons');
  weapons.add(PLAYGROUND, 'cooldown', 0, 3, 0.05).name('Cooldown (s)');
  weapons.add(AIM, 'chargeSeconds', 0.2, 3, 0.05).name('Charge time (s)');
  weapons.add(AIM, 'pitchOffset', -0.5, 1.5, 0.01).name('Aim tilt');
  const gust = weapons.addFolder('Wing Gust').close();
  gust.add(GUST, 'range', 1, 10, 0.1).name('Range');
  gust.add(GUST, 'halfAngle', 0.1, 1.4, 0.01).name('Cone half-angle');
  gust.add(GUST, 'force', 0, 25, 0.1).name('Push');
  gust.add(GUST, 'lift', 0, 12, 0.1).name('Lift');
  gust.add(GUST, 'lampForce', 0, 15, 0.1).name('Lamp push');
  gust.add(GUST, 'reachUp', 0, 10, 0.1).name('Reach upwards');
  gust.add(GUST, 'stagger', 0, 2, 0.05).name('Stagger (s)');
  const bosh = weapons.addFolder('Bosh').close();
  bosh.add(BOSH, 'range', 0.5, 4, 0.05).name('Reach');
  bosh.add(BOSH, 'halfAngle', 0.1, 1.4, 0.01).name('Arc half-angle');
  bosh.add(BOSH, 'force', 0, 40, 0.5).name('Knockback');
  bosh.add(BOSH, 'lift', 0, 15, 0.1).name('Lift');
  bosh.add(BOSH, 'lampForce', 0, 20, 0.1).name('Lamp punch');
  bosh.add(BOSH, 'stagger', 0, 3, 0.05).name('Stagger (s)');
  bosh.add(BOSH, 'shake', 0, 1, 0.01).name('Screen shake');
  bosh.add(BOSH, 'loudness', 0, 8, 0.1).name('Loudness');
  const zap = weapons.addFolder('Zap Switch').close();
  zap.add(ZAP, 'duration', 1, 30, 0.5).name('Zapper time (s)');
  zap.add(ZAP, 'launch', 0, 20, 0.1).name('Launch sideways');
  zap.add(ZAP, 'lift', 0, 20, 0.1).name('Launch upwards');
  zap.add(ZAP, 'flightTime', 0.3, 4, 0.05).name('Flight time (s)');
  zap.add(ZAP, 'hitstop', 0, 0.6, 0.01).name('Freeze-frame (s)');
  const cap = weapons.addFolder('Bottle-Cap Flick').close();
  cap.add(CAP, 'minSpeed', 1, 30, 0.5).name('Min speed');
  cap.add(CAP, 'maxSpeed', 1, 40, 0.5).name('Max speed');
  cap.add(CAP, 'knock', 0, 25, 0.1).name('Knockback');
  cap.add(CAP, 'lift', 0, 12, 0.1).name('Lift');
  cap.add(CAP, 'lifetime', 0.5, 8, 0.1).name('Lifetime (s)');
  const cracker = weapons.addFolder('Firecracker').close();
  cracker.add(FIRECRACKER, 'minSpeed', 1, 25, 0.5).name('Min speed');
  cracker.add(FIRECRACKER, 'maxSpeed', 1, 30, 0.5).name('Max speed');
  cracker.add(FIRECRACKER, 'fuse', 0.3, 6, 0.1).name('Fuse (s)');
  cracker.add(FIRECRACKER, 'blastRadius', 0.5, 8, 0.1).name('Blast radius');
  cracker.add(FIRECRACKER, 'force', 0, 30, 0.1).name('Blast push');
  cracker.add(FIRECRACKER, 'lift', 0, 15, 0.1).name('Blast lift');
  cracker.add(FIRECRACKER, 'lampRadius', 0, 10, 0.1).name('Lamp reach');
  cracker.add(FIRECRACKER, 'lampForce', 0, 20, 0.1).name('Lamp push');
  weapons.onFinishChange(changed);

  const sound = gui.addFolder('Sound').close();
  sound.add(AUDIO, 'master', 0, 1.5, 0.01).name('Master volume');
  sound.add(AUDIO, 'effects', 0, 1.5, 0.01).name('Effects volume');
  sound.add(AUDIO, 'music', 0, 1, 0.01).name('Music');
  sound.add(AUDIO, 'ambience', 0, 1, 0.01).name('Night crickets');
  sound.add(AUDIO, 'falloff', 5, 150, 1).name('Distance falloff');
  sound.onFinishChange(changed);

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
    smack: actions.smack,
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
  gui.add(buttons, 'smack').name('Smack the active moth');
  gui.add(buttons, 'copy').name('Copy settings as JSON');
  gui.add(buttons, 'reset').name('Reset to defaults');
  return {
    destroy() {
      gui.destroy();
    },
  };
}
