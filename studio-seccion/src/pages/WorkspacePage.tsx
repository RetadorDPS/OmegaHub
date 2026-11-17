import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '../editor/Editor';
import { restorePlan } from '../editor/planActions';
import { closeProject, openProject, patchMeta, useEditor } from '../editor/store';
import { validateProject } from '../model/validate';
import { hrefFor, navigate } from '../router';
import { loadProject, saveProject } from '../storage/db';

const ProjectViewer = lazy(() => import('./ProjectViewer'));

type SaveState = { kind: 'guardado'; at: number } | { kind: 'guardando' } | { kind: 'error'; message: string };

export default function WorkspacePage({ id, view }: { id: string; view: 'plano' | '3d' }) {
  const project = useEditor((s) => s.project);
  const revision = useEditor((s) => s.revision);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'guardado', at: Date.now() });
  const savedRevision = useRef(0);

  // Apertura: proyecto y, si lo tiene, su plano guardado.
  useEffect(() => {
    let alive = true;
    setLoadError(null);
    loadProject(id)
      .then(async (p) => {
        if (!alive) return;
        openProject(p);
        savedRevision.current = useEditor.getState().revision;
        setSave({ kind: 'guardado', at: p.updatedAt });
        await restorePlan();
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
      // Lo pendiente se guarda antes de soltar el proyecto.
      const st = useEditor.getState();
      if (st.project && st.revision !== savedRevision.current) void saveProject(st.project);
      closeProject();
    };
  }, [id]);

  // Guardado automático tras cada cambio.
  useEffect(() => {
    if (!project || project.id !== id || revision === savedRevision.current) return;
    setSave({ kind: 'guardando' });
    const timer = window.setTimeout(() => {
      const current = useEditor.getState().project;
      if (!current) return;
      const rev = useEditor.getState().revision;
      saveProject(current)
        .then(() => {
          savedRevision.current = rev;
          setSave({ kind: 'guardado', at: Date.now() });
        })
        .catch((e: Error) => setSave({ kind: 'error', message: e.message }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [project, revision, id]);

  // Al salir de la página se guarda lo pendiente sin esperar al temporizador.
  useEffect(() => {
    const flush = () => {
      const st = useEditor.getState();
      if (st.project && st.revision !== savedRevision.current) void saveProject(st.project);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const validation = useMemo(() => (project ? validateProject(project) : null), [project]);

  if (loadError) {
    return (
      <main className="blocked" role="alert">
        <h1>No se pudo abrir el proyecto</h1>
        <p>{loadError}</p>
        <a className="btn btn--dark" href={hrefFor({ name: 'proyectos' })}>
          Volver a mis proyectos
        </a>
      </main>
    );
  }
  if (!project || project.id !== id || !validation) {
    return (
      <div className="loading" role="status">
        <b>Studio Sección</b>
        <span>Abriendo el proyecto…</span>
      </div>
    );
  }

  if (view === '3d') {
    if (!validation.canGenerate) {
      return (
        <main className="blocked" data-testid="faltan-datos">
          <h1>Aún no se puede generar el 3D</h1>
          <p>Al modelo le faltan datos. Corrígelos en el plano:</p>
          <ul>
            {validation.issues
              .filter((i) => i.level === 'error')
              .map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
          </ul>
          <a className="btn btn--dark" href={hrefFor({ name: 'proyecto', id, view: 'plano' })}>
            Volver al plano
          </a>
        </main>
      );
    }
    return (
      <Suspense
        fallback={
          <div className="loading" role="status">
            <b>{project.name}</b>
            <span>Generando el modelo…</span>
          </div>
        }
      >
        <ProjectViewer project={project} validation={validation} />
      </Suspense>
    );
  }

  return (
    <div className="workspace" data-testid="espacio">
      <header className="wbar">
        <a className="wbar__back" href={hrefFor({ name: 'proyectos' })} data-testid="volver-proyectos">
          ← Proyectos
        </a>
        <input
          className="wbar__name"
          type="text"
          value={project.name}
          maxLength={60}
          aria-label="Nombre del proyecto"
          data-testid="nombre"
          onChange={(e) => patchMeta({ name: e.target.value })}
        />
        <span className="wbar__save" data-state={save.kind} data-testid="estado-guardado" role="status">
          {save.kind === 'guardando'
            ? 'Guardando…'
            : save.kind === 'error'
              ? `Sin guardar: ${save.message}`
              : 'Guardado en este dispositivo'}
        </span>
        <nav className="wbar__tabs" aria-label="Vista">
          <button type="button" aria-pressed="true">
            Plano
          </button>
          <button
            type="button"
            aria-pressed="false"
            data-testid="pestana-3d"
            disabled={!validation.canGenerate}
            title={validation.canGenerate ? 'Ver el modelo generado' : 'Completa la comprobación para generar el 3D'}
            onClick={() => navigate({ name: 'proyecto', id, view: '3d' })}
          >
            3D
          </button>
        </nav>
      </header>
      <Editor onGenerate={() => navigate({ name: 'proyecto', id, view: '3d' })} />
    </div>
  );
}
