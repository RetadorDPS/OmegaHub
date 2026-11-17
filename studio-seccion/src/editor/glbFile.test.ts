import { describe, expect, it } from 'vitest';
import { GlbError, inspectGlb } from './glbFile';

function glb(json: object): ArrayBuffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(20 + body.length);
  const v = new DataView(buf);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, buf.byteLength, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(body);
  return buf;
}

describe('modelos GLB importados', () => {
  it('acepta un GLB válido', () => {
    expect(() => inspectGlb('casa.glb', glb({ asset: { version: '2.0' } }))).not.toThrow();
  });
  it('rechaza archivos que no son GLB', () => {
    expect(() => inspectGlb('casa.glb', new TextEncoder().encode('hola mundo, no soy un glb').buffer as ArrayBuffer)).toThrow(GlbError);
  });
  it('rechaza compresiones que exigirían decodificadores externos', () => {
    expect(() => inspectGlb('casa.glb', glb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] }))).toThrow(/Draco/);
  });
  it('rechaza referencias a archivos externos', () => {
    expect(() => inspectGlb('casa.glb', glb({ asset: { version: '2.0' }, images: [{ uri: 'https://ejemplo.com/textura.jpg' }] }))).toThrow(/externos/);
  });
});
