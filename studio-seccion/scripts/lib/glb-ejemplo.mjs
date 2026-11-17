// GLB mínimo y válido (una casita de cajas, en CENTÍMETROS) para probar la importación.
export function sampleGlb() {
  const boxes = [
    // [x0, y0, z0, x1, y1, z1] en cm
    [0, -20, 0, 900, 0, 700],
    [0, 0, 0, 900, 280, 25],
    [0, 0, 675, 900, 280, 700],
    [0, 0, 0, 25, 280, 700],
    [875, 0, 0, 900, 280, 700],
    [-30, 280, -30, 930, 310, 730],
  ];
  const pos = [];
  const nor = [];
  const idx = [];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const faces = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
      [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ];
    for (const [n, quad] of faces) {
      const base = pos.length / 3;
      for (const v of quad) {
        pos.push(...v);
        nor.push(...n);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const P = new Float32Array(pos);
  const N = new Float32Array(nor);
  const I = new Uint16Array(idx);
  const bin = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(I.buffer), Buffer.alloc((4 - (I.byteLength % 4)) % 4)]);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], pos[i + k])), (max[k] = Math.max(max[k], pos[i + k]));
  const json = {
    asset: { version: '2.0', generator: 'Studio Sección (prueba)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Casita' }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.92, 0.89, 0.83, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: P.byteLength, target: 34962 },
      { buffer: 0, byteOffset: P.byteLength, byteLength: N.byteLength, target: 34962 },
      { buffer: 0, byteOffset: P.byteLength + N.byteLength, byteLength: I.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: N.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: I.length, type: 'SCALAR' },
    ],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const jsonBuf = Buffer.from(text);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, bin]);
}
