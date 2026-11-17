/**
 * Acciones sobre el plano de fondo: adjuntar, restaurar al reabrir, cambiar de
 * página y quitar. El binario original se guarda en IndexedDB junto al proyecto.
 */
import { deletePlanFile, loadPlanFile, savePlanFile } from '../storage/db';
import { inspectPlanData, PlanFileError, rasterizePlan, readPlanFile, type PlanBinary } from './planFile';
import { commit, notify, patchMeta, useEditor } from './store';

/** Binario del plano abierto, en memoria, para cambiar de página sin releer el disco. */
let current: { projectId: string; binary: PlanBinary } | null = null;

const errorText = (e: unknown, fallback: string) =>
  e instanceof PlanFileError || (e instanceof Error && e.name === 'StorageError') ? (e as Error).message : fallback;

async function show(binary: PlanBinary, page: number, opts: { fresh: boolean }) {
  const st = useEditor.getState();
  const project = st.project;
  if (!project) return;
  useEditor.setState({ rasterBusy: true });
  try {
    const raster = await rasterizePlan(binary, page);
    if (useEditor.getState().project?.id !== project.id) {
      raster.release();
      return;
    }
    useEditor.getState().raster?.release();
    current = { projectId: project.id, binary };
    const previous = project.plan;
    const samePage = !opts.fresh && previous && previous.page === raster.page;
    patchMeta({
      plan: {
        kind: binary.kind,
        fileName: binary.name,
        mime: binary.mime,
        bytes: binary.data.byteLength,
        page: raster.page,
        pageCount: raster.pageCount,
        width: raster.width,
        height: raster.height,
      },
    });
    if (!samePage) {
      // La escala pertenece a una página o imagen concreta: al cambiarla hay que volver a calibrar.
      if (useEditor.getState().project?.calibration) commit({ calibration: null });
      useEditor.setState({ tool: 'calibrate', calibration: { a: null, b: null } });
    } else if (previous && project.calibration && previous.width !== raster.width) {
      // El ráster ha salido con otro tamaño (otro dispositivo): se conserva la escala real.
      const k = previous.width / raster.width;
      const c = project.calibration;
      commit({
        calibration: {
          ...c,
          a: { x: c.a.x / k, y: c.a.y / k },
          b: { x: c.b.x / k, y: c.b.y / k },
          metersPerPixel: c.metersPerPixel * k,
        },
      });
    }
    useEditor.setState({ raster });
  } finally {
    useEditor.setState({ rasterBusy: false });
  }
}

/** Adjunta un plano nuevo al proyecto abierto. Devuelve un mensaje de error o null. */
export async function attachPlan(binary: PlanBinary): Promise<string | null> {
  const project = useEditor.getState().project;
  if (!project) return 'No hay ningún proyecto abierto.';
  try {
    await show(binary, 1, { fresh: true });
    await savePlanFile({ projectId: project.id, name: binary.name, mime: binary.mime, data: binary.data });
    return null;
  } catch (e) {
    const text = errorText(e, 'No se pudo cargar el plano.');
    notify('error', text, 9000);
    return text;
  }
}

export async function attachPlanFile(file: File): Promise<string | null> {
  try {
    return await attachPlan(await readPlanFile(file));
  } catch (e) {
    const text = errorText(e, `No se pudo leer «${file.name}».`);
    notify('error', text, 9000);
    return text;
  }
}

/** Carga un plano de ejemplo servido por la propia app. */
export async function attachSamplePlan(path: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new PlanFileError('No se encontró el plano de ejemplo en esta instalación.');
    return await attachPlan(inspectPlanData(name, await res.arrayBuffer()));
  } catch (e) {
    const text = errorText(e, 'No se pudo cargar el plano de ejemplo.');
    notify('error', text, 9000);
    return text;
  }
}

/** Al reabrir un proyecto: recupera el archivo guardado y lo vuelve a dibujar. */
export async function restorePlan(): Promise<void> {
  const project = useEditor.getState().project;
  if (!project?.plan) return;
  try {
    const stored = await loadPlanFile(project.id);
    if (!stored) {
      notify('error', 'No se encuentra el archivo del plano de este proyecto. El trazado se conserva; puedes volver a subir el plano.', 9000);
      return;
    }
    const binary = inspectPlanData(stored.name, stored.data);
    await show(binary, project.plan.page, { fresh: false });
  } catch (e) {
    notify('error', errorText(e, 'No se pudo volver a abrir el plano guardado.'), 9000);
  }
}

export async function changePlanPage(page: number): Promise<void> {
  const project = useEditor.getState().project;
  if (!project || !current || current.projectId !== project.id) return;
  try {
    await show(current.binary, page, { fresh: false });
  } catch (e) {
    notify('error', errorText(e, 'No se pudo abrir esa página.'));
  }
}

export async function removePlan(): Promise<void> {
  const st = useEditor.getState();
  if (!st.project) return;
  st.raster?.release();
  current = null;
  useEditor.setState({ raster: null, tool: 'select' });
  patchMeta({ plan: null });
  if (useEditor.getState().project?.calibration) commit({ calibration: null });
  try {
    await deletePlanFile(st.project.id);
  } catch {
    // El proyecto ya no referencia el archivo; un fallo al borrarlo no bloquea.
  }
}
