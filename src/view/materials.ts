import {
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

function canvasTexture(kind: 'felt' | 'wood') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create material textures.');
  let seed = 1337;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  context.fillStyle = kind === 'felt' ? '#c7c2b8' : '#b7a18a';
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < (kind === 'felt' ? 18000 : 1700); i++) {
    const x = random() * 256;
    const y = random() * 256;
    const shade = Math.floor(90 + random() * 150);
    context.strokeStyle = `rgba(${shade},${shade},${shade},${kind === 'felt' ? 0.4 : 0.15})`;
    context.lineWidth = kind === 'felt' ? 0.6 : 0.8;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(
      x + (kind === 'felt' ? random() * 5 - 2.5 : 30 + random() * 70),
      y + (random() - 0.5) * 4,
    );
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(kind === 'felt' ? 3 : 2, kind === 'felt' ? 3 : 5);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createMaterials() {
  const felt = canvasTexture('felt');
  const wood = canvasTexture('wood');
  return {
    felt(color: number) {
      return new MeshStandardMaterial({
        color,
        map: felt,
        bumpMap: felt,
        bumpScale: 0.045,
        roughness: 1,
      });
    },
    wood: new MeshStandardMaterial({
      color: 0x9d7353,
      map: wood,
      bumpMap: wood,
      bumpScale: 0.035,
      roughness: 0.86,
    }),
    dispose() {
      felt.dispose();
      wood.dispose();
    },
  };
}
