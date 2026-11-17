/**
 * Grabación del recorrido guiado a vídeo, en el propio navegador
 * (MediaRecorder sobre el lienzo). Formato MP4 si el navegador lo admite;
 * si no, WebM. No se sube nada: el archivo se descarga al terminar.
 */
export interface Recording {
  stop: () => Promise<{ blob: Blob; ext: string }>;
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

function pickType(): { mime: string; ext: string } {
  const options = [
    { mime: 'video/mp4;codecs=avc1.640028', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  return options.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? { mime: '', ext: 'webm' };
}

export function startRecording(canvas: HTMLCanvasElement, fps = 30): Recording {
  const stream = canvas.captureStream(fps);
  const { mime, ext } = pickType();
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(500);
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }), ext });
        };
        recorder.stop();
      }),
  };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
