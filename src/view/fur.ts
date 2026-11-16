import {
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from 'three';
import { FUR, MAX_FUR_LAYERS } from '../config';

// Shared by every moth so the tuning panel can change fur live.
const uniforms = {
  furLayers: { value: FUR.layers },
  furLength: { value: FUR.length },
  furDensity: { value: FUR.density },
  furThickness: { value: FUR.thickness },
  furDroop: { value: FUR.droop },
  furRootShade: { value: FUR.rootShade },
};

/** Copy the live tuning values into the shader uniforms once per frame. */
export function updateFur() {
  uniforms.furLayers.value = FUR.layers;
  uniforms.furLength.value = FUR.length;
  uniforms.furDensity.value = FUR.density;
  uniforms.furThickness.value = FUR.thickness;
  uniforms.furDroop.value = FUR.droop;
  uniforms.furRootShade.value = FUR.rootShade;
}

/**
 * Turns a felt material into a fur-shell material. Each instance is one
 * shell: it is pushed out along the surface normal (in view space, so the
 * fur stays the same length on stretched spheres) and cut into tapered
 * strands by a per-cell hash, so higher shells keep fewer, thinner strands.
 */
function shellMaterial(base: MeshStandardMaterial) {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float shellIndex;
        uniform float furLayers;
        uniform float furLength;
        uniform float furDroop;
        varying float vShellLayer;
        varying vec2 vShellUv;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        float shellLayer = (shellIndex + 1.0) / furLayers;
        vShellLayer = shellLayer;
        vShellUv = uv;
        vec3 shellNormal = normalize(normalMatrix * objectNormal);
        vec3 shellDown = (viewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz;
        mvPosition.xyz +=
          (shellNormal + shellDown * furDroop * shellLayer) *
          furLength * shellLayer;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float furDensity;
        uniform float furThickness;
        uniform float furRootShade;
        varying float vShellLayer;
        varying vec2 vShellUv;
        float shellHash(vec2 cell) {
          return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Sphere UVs are twice as wide as tall, so double the U cells.
        vec2 shellGrid = vShellUv * vec2(furDensity * 2.0, furDensity);
        vec2 shellCell = floor(shellGrid);
        float strandHeight = shellHash(shellCell);
        float fromCentre = length(fract(shellGrid) - 0.5) * 2.0;
        // Strands taper towards their tips and end at a random height.
        if (strandHeight < vShellLayer ||
            fromCentre > furThickness * (1.0 - vShellLayer))
          discard;
        diffuseColor.rgb *= mix(1.0 - furRootShade, 1.0, vShellLayer);`,
      );
  };
  material.customProgramCacheKey = () => 'moth-fur-shell';
  return material;
}

/** Fur shells for one body part; add as a sibling with the part's transform. */
export function createFurShells(
  geometry: BufferGeometry,
  base: MeshStandardMaterial,
) {
  const shells = new InstancedMesh(
    geometry,
    shellMaterial(base),
    MAX_FUR_LAYERS,
  );
  const identity = new Matrix4();
  const indices = new Float32Array(MAX_FUR_LAYERS);
  for (let i = 0; i < MAX_FUR_LAYERS; i++) {
    shells.setMatrixAt(i, identity);
    indices[i] = i;
  }
  geometry = geometry.clone();
  geometry.setAttribute('shellIndex', new InstancedBufferAttribute(indices, 1));
  shells.geometry = geometry;
  shells.count = FUR.layers;
  // Shells only receive light; the solid body underneath casts the shadow.
  shells.castShadow = false;
  shells.receiveShadow = true;
  shells.frustumCulled = false;
  return shells;
}
