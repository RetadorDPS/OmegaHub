import { describe, expect, it } from 'vitest';
import { inspectPlanData, MAX_FILE_BYTES, PlanFileError, sniffPlanFormat } from './planFile';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('formato del plano', () => {
  it('reconoce PDF, PNG y JPG por su firma', () => {
    expect(sniffPlanFormat(ascii('%PDF-1.7\n...'))?.kind).toBe('pdf');
    expect(sniffPlanFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    expect(sniffPlanFormat(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
  });

  it('rechaza otros formatos aunque tengan extensión de imagen', () => {
    expect(sniffPlanFormat(ascii('GIF89a........'))).toBeNull();
    expect(sniffPlanFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(() => inspectPlanData('plano.png', ascii('esto no es una imagen').buffer as ArrayBuffer)).toThrow(PlanFileError);
    expect(() => inspectPlanData('plano.dxf', ascii('0\nSECTION\n2\nHEADER').buffer as ArrayBuffer)).toThrow(/DXF/);
  });

  it('explica el límite de tamaño y el archivo vacío', () => {
    expect(() => inspectPlanData('vacio.pdf', new ArrayBuffer(0))).toThrow(/vacío/);
    const big = { byteLength: MAX_FILE_BYTES + 1 } as ArrayBuffer;
    expect(() => inspectPlanData('enorme.pdf', big)).toThrow(/máximo/);
  });
});
