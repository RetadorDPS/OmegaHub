/**
 * Importación de modelos GLB preparados en otra herramienta (SketchUp, Revit,
 * Blender…). El archivo es un dato no confiable: se comprueba la cabecera, se
 * rechazan extensiones que exigirían descargar decodificadores de terceros y
 * no se sigue ninguna referencia externa.
 */
export const MAX_GLB_BYTES = 150 * 1024 * 1024;

export class GlbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlbError';
  }
}

const UNSUPPORTED: Record<string, string> = {
  KHR_draco_mesh_compression: 'compresión Draco',
  EXT_meshopt_compression: 'compresión Meshopt',
  KHR_texture_basisu: 'texturas KTX2/Basis',
};

/** Valida la cabecera GLB y devuelve las extensiones obligatorias que declara. */
export function inspectGlb(name: string, data: ArrayBuffer): void {
  if (data.byteLength === 0) throw new GlbError(`«${name}» está vacío.`);
  if (data.byteLength > MAX_GLB_BYTES) {
    throw new GlbError(`«${name}» pesa ${(data.byteLength / 1048576).toFixed(0)} MB y el máximo es ${MAX_GLB_BYTES / 1048576} MB.`);
  }
  const view = new DataView(data);
  if (data.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new GlbError(`«${name}» no es un archivo GLB. Exporta el modelo como glTF binario (.glb).`);
  }
  const version = view.getUint32(4, true);
  if (version !== 2) throw new GlbError(`«${name}» es glTF ${version}; solo se admite glTF 2.0.`);
  const jsonLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || 20 + jsonLength > data.byteLength) throw new GlbError(`«${name}» está dañado.`);
  let json: { extensionsRequired?: string[]; buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
  } catch {
    throw new GlbError(`«${name}» está dañado.`);
  }
  const blocked = (json.extensionsRequired ?? []).filter((e) => e in UNSUPPORTED);
  if (blocked.length) {
    throw new GlbError(`«${name}» usa ${blocked.map((e) => UNSUPPORTED[e]).join(' y ')}. Expórtalo sin compresión para poder abrirlo aquí.`);
  }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((x) => x.uri && !x.uri.startsWith('data:'));
  if (external) {
    throw new GlbError(`«${name}» depende de archivos externos. Exporta un .glb con todo incrustado.`);
  }
}
