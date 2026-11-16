import type { ShaderMaterial } from 'three';
import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * One direction of a separable 9-tap blur whose radius grows with vertical
 * distance from a sharp focus band: the classic "miniature" tilt-shift look.
 * Run once horizontally and once vertically.
 */
const tiltShiftShader = {
  name: 'MothTiltShift',
  uniforms: {
    tDiffuse: { value: null },
    direction: { value: new Vector2(1, 0) },
    // Blur step in UV units at the edge of the frame.
    amount: { value: 0.004 },
    focus: { value: 0.5 },
    band: { value: 0.12 },
    saturation: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 direction;
    uniform float amount;
    uniform float focus;
    uniform float band;
    uniform float saturation;
    varying vec2 vUv;
    void main() {
      float distanceFromBand = max(0.0, abs(vUv.y - focus) - band);
      vec2 stepUv = direction * amount * smoothstep(0.0, 0.5, distanceFromBand);
      vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
      sum += (texture2D(tDiffuse, vUv - stepUv) + texture2D(tDiffuse, vUv + stepUv)) * 0.1531;
      sum += (texture2D(tDiffuse, vUv - 2.0 * stepUv) + texture2D(tDiffuse, vUv + 2.0 * stepUv)) * 0.12245;
      sum += (texture2D(tDiffuse, vUv - 3.0 * stepUv) + texture2D(tDiffuse, vUv + 3.0 * stepUv)) * 0.0918;
      sum += (texture2D(tDiffuse, vUv - 4.0 * stepUv) + texture2D(tDiffuse, vUv + 4.0 * stepUv)) * 0.051;
      float grey = dot(sum.rgb, vec3(0.2126, 0.7152, 0.0722));
      sum.rgb = mix(vec3(grey), sum.rgb, saturation);
      gl_FragColor = sum;
    }`,
};

export type TiltShiftSettings = {
  strength: number;
  band: number;
  focus: number;
  saturation: number;
};

export function createTiltShiftPasses() {
  const horizontal = new ShaderPass(tiltShiftShader);
  const vertical = new ShaderPass(tiltShiftShader);
  (vertical.material as ShaderMaterial).uniforms.direction!.value = new Vector2(
    0,
    1,
  );
  return {
    passes: [horizontal, vertical] as const,
    /**
     * `strength` is the blur step in pixels at the frame edge (the blur spans
     * about four steps each way); `focus` runs from 0 (bottom) to 1 (top).
     */
    update(settings: TiltShiftSettings, width: number, height: number) {
      for (const [pass, size] of [
        [horizontal, width],
        [vertical, height],
      ] as const) {
        const uniforms = (pass.material as ShaderMaterial).uniforms;
        uniforms.amount!.value = settings.strength / Math.max(size, 1);
        uniforms.focus!.value = settings.focus;
        uniforms.band!.value = settings.band;
        // Saturate once, in the final pass only.
        uniforms.saturation!.value =
          pass === vertical ? settings.saturation : 1;
      }
    },
  };
}
