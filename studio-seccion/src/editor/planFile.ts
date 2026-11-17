/**
 * Carga del plano de fondo. El PDF o la imagen se usan SOLO como referencia
 * visual para trazar encima: no se interpreta su contenido ni se deducen cotas.
 * Todo ocurre en el navegador; el archivo no se envía a ningún servidor.
 */

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** Lado máximo del ráster que se usa como fondo. */
export const MAX_RASTER_SIDE = 5000;
const PDF_TARGET_SIDE = 2600;

export type PlanKind = 'pdf' | 'image';

export class PlanFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanFileError';
  }
}

/** Identifica el formato por su firma binaria, no por la extensión. */
export function sniffPlanFormat(bytes: Uint8Array): { kind: PlanKind; mime: string } | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  // La cabecera %PDF- puede ir precedida de unos pocos bytes (BOM, saltos de línea).
  for (let i = 0; i < Math.min(bytes.length - 5, 64); i++) {
    if (starts([0x25, 0x50, 0x44, 0x46, 0x2d], i)) return { kind: 'pdf', mime: 'application/pdf' };
  }
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mime: 'image/png' };
  if (starts([0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg' };
  return null;
}

export interface PlanBinary {
  kind: PlanKind;
  mime: string;
  name: string;
  data: ArrayBuffer;
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;

/** Valida tamaño y formato. Lanza PlanFileError con un mensaje para el usuario. */
export function inspectPlanData(name: string, data: ArrayBuffer): PlanBinary {
  if (data.byteLength === 0) throw new PlanFileError(`«${name}» está vacío.`);
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new PlanFileError(
      `«${name}» pesa ${mb(data.byteLength)} y el máximo es ${mb(MAX_FILE_BYTES)}. Exporta el plano a menor resolución o solo la página que necesitas.`,
    );
  }
  const format = sniffPlanFormat(new Uint8Array(data, 0, Math.min(data.byteLength, 1100)));
  if (!format) {
    throw new PlanFileError(
      `«${name}» no es un PDF, PNG ni JPG válido. Si tienes un DWG, DXF o IFC, expórtalo a PDF o imagen: esos formatos aún no se importan.`,
    );
  }
  return { ...format, name, data };
}

export async function readPlanFile(file: File): Promise<PlanBinary> {
  if (file.size > MAX_FILE_BYTES) {
    throw new PlanFileError(
      `«${file.name}» pesa ${mb(file.size)} y el máximo es ${mb(MAX_FILE_BYTES)}. Exporta el plano a menor resolución o solo la página que necesitas.`,
    );
  }
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new PlanFileError(`No se pudo leer «${file.name}». Vuelve a seleccionarlo.`);
  }
  return inspectPlanData(file.name, data);
}

export interface PlanRaster {
  /** URL de objeto local (blob:) con el ráster; hay que liberarla con `release`. */
  url: string;
  width: number;
  height: number;
  page: number;
  pageCount: number;
  release: () => void;
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new PlanFileError('No se pudo preparar la imagen del plano. Prueba con menor resolución.'));
    }, 'image/png');
  });
}

async function rasterizeImage(plan: PlanBinary): Promise<PlanRaster> {
  const blob = new Blob([plan.data], { type: plan.mime });
  const sourceUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = sourceUrl;
    });
  } catch {
    URL.revokeObjectURL(sourceUrl);
    throw new PlanFileError(`«${plan.name}» parece una imagen pero está dañada y no se puede abrir.`);
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) {
    URL.revokeObjectURL(sourceUrl);
    throw new PlanFileError(`«${plan.name}» no contiene una imagen utilizable.`);
  }
  const longest = Math.max(w, h);
  if (longest <= MAX_RASTER_SIDE) {
    return { url: sourceUrl, width: w, height: h, page: 1, pageCount: 1, release: () => URL.revokeObjectURL(sourceUrl) };
  }
  // Imagen enorme: se reduce para el fondo. La calibración se hace sobre este ráster.
  const k = MAX_RASTER_SIDE / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(sourceUrl);
  const url = await canvasToUrl(canvas);
  return { url, width: canvas.width, height: canvas.height, page: 1, pageCount: 1, release: () => URL.revokeObjectURL(url) };
}

async function rasterizePdf(plan: PlanBinary, page: number): Promise<PlanRaster> {
  // PDF.js se descarga solo cuando hace falta; su worker es un archivo de la propia app.
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    // PDF.js se queda con el búfer: se le pasa una copia.
    data: new Uint8Array(plan.data.slice(0)),
    // El archivo es un dato no confiable: sin formularios XFA ni recursos externos.
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const name = (e as { name?: string } | null)?.name;
    if (name === 'PasswordException') {
      throw new PlanFileError(`«${plan.name}» está protegido con contraseña. Guarda una copia sin protección y vuelve a subirla.`);
    }
    throw new PlanFileError(`«${plan.name}» no se puede abrir como PDF: el archivo está dañado o incompleto.`);
  }
  try {
    const pageCount = doc.numPages;
    const n = Math.max(1, Math.min(pageCount, page));
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(4, PDF_TARGET_SIDE / Math.max(base.width, base.height));
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    const url = await canvasToUrl(canvas);
    return { url, width: canvas.width, height: canvas.height, page: n, pageCount, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    if (e instanceof PlanFileError) throw e;
    throw new PlanFileError(`No se pudo dibujar la página de «${plan.name}».`);
  } finally {
    void task.destroy();
  }
}

export function rasterizePlan(plan: PlanBinary, page = 1): Promise<PlanRaster> {
  return plan.kind === 'pdf' ? rasterizePdf(plan, page) : rasterizeImage(plan);
}
