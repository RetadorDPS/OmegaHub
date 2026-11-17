import { useEffect, useRef, useState } from 'react';
import { createProject } from '../model/project';
import { hrefFor, navigate } from '../router';
import { deleteProject, listProjects, savePlanFile, saveProject, storageEstimate, type ProjectSummary } from '../storage/db';
import { GlbError, inspectGlb } from '../editor/glbFile';

function Thumbnail({ outline }: { outline: ProjectSummary['outline'] }) {
  if (outline.length === 0) {
    return (
      <svg viewBox="0 0 120 80" className="thumb" aria-hidden="true">
        <text x="60" y="44" textAnchor="middle" className="thumb__empty">
          sin trazado
        </text>
      </svg>
    );
  }
  const xs = outline.flatMap((s) => [s.ax, s.bx]);
  const ys = outline.flatMap((s) => [s.ay, s.by]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(0.5, Math.max(...xs) - minX);
  const h = Math.max(0.5, Math.max(...ys) - minY);
  const k = Math.min(100 / w, 60 / h);
  const ox = (120 - w * k) / 2;
  const oy = (80 - h * k) / 2;
  return (
    <svg viewBox="0 0 120 80" className="thumb" aria-hidden="true">
      {outline.map((s, i) => (
        <line key={i} x1={ox + (s.ax - minX) * k} y1={oy + (s.ay - minY) * k} x2={ox + (s.bx - minX) * k} y2={oy + (s.by - minY) * k} />
      ))}
    </svg>
  );
}

const when = (t: number) =>
  new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setProjects(await listProjects());
      const est = await storageEstimate();
      if (est) setUsage(`${(est.usage / (1024 * 1024)).toFixed(1).replace('.', ',')} MB usados en este navegador`);
    } catch (e) {
      setProjects([]);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    const project = createProject(name || 'Proyecto sin título');
    try {
      await saveProject(project);
      navigate({ name: 'proyecto', id: project.id, view: 'plano' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const glbInput = useRef<HTMLInputElement>(null);
  const importGlb = async (file: File) => {
    setError(null);
    try {
      const data = await file.arrayBuffer();
      inspectGlb(file.name, data);
      const project = { ...createProject(file.name.replace(/\.glb$/i, '') || 'Modelo 3D'), model: { fileName: file.name, bytes: data.byteLength, units: 'm' as const } };
      await saveProject(project);
      await savePlanFile({ projectId: project.id, name: file.name, mime: 'model/gltf-binary', data });
      navigate({ name: 'modelo', id: project.id });
    } catch (e) {
      setError(e instanceof GlbError ? e.message : (e as Error).message || 'No se pudo importar el modelo.');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteProject(id);
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="projects" data-testid="proyectos">
      <header className="projects__top">
        <a className="wordmark wordmark--dark" href={hrefFor({ name: 'portada' })}>
          Studio Sección
        </a>
        <a className="link" href={hrefFor({ name: 'demo' })}>
          Ver Villa Mirador
        </a>
      </header>

      <section className="projects__hero">
        <p className="mono">Crear desde mi plano</p>
        <h1>Del plano a un espacio que puedes recorrer</h1>
        <ol className="steps">
          <li>
            <b>Plano</b> Sube un PDF, PNG o JPG de una planta.
          </li>
          <li>
            <b>Escala</b> Marca dos puntos y su distancia real.
          </li>
          <li>
            <b>Trazado</b> Muros, puertas, ventanas, losa y estancias.
          </li>
          <li>
            <b>3D</b> Exterior, maqueta y recorrido a pie.
          </li>
        </ol>
        <form
          className="projects__new"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="sr-only" htmlFor="nombre-proyecto">
            Nombre del proyecto
          </label>
          <input id="nombre-proyecto" type="text" placeholder="Nombre del proyecto" maxLength={60} value={name} data-testid="nombre-proyecto" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn--dark" data-testid="crear-proyecto">
            Crear proyecto
          </button>
        </form>
        <p className="projects__scope">
          ¿Ya tienes el modelo 3D hecho en SketchUp, Revit o Blender?{' '}
          <button type="button" className="link" data-testid="importar-glb" onClick={() => glbInput.current?.click()}>
            Importar un archivo GLB
          </button>
          <input
            ref={glbInput}
            type="file"
            accept=".glb,model/gltf-binary"
            className="sr-only"
            data-testid="archivo-glb"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importGlb(f);
            }}
          />
        </p>
        <p className="projects__scope">
          Esta versión trabaja con proyectos de <b>una planta</b> trazados por ti sobre el plano. No convierte planos automáticamente ni importa DWG, DXF
          o IFC.
        </p>
      </section>

      {error && (
        <p className="projects__error" role="alert">
          {error}
        </p>
      )}

      <section className="projects__list" aria-live="polite">
        <div className="projects__list-head">
          <h2>Tus proyectos</h2>
          <p>
            Guardados solo en este dispositivo y navegador. No hay cuenta, copia en la nube ni enlace para compartir.{usage ? ` ${usage}.` : ''}
          </p>
        </div>
        {projects === null ? (
          <p className="projects__empty">Leyendo el almacenamiento local…</p>
        ) : projects.length === 0 ? (
          <p className="projects__empty" data-testid="sin-proyectos">
            Aún no hay proyectos guardados aquí.
          </p>
        ) : (
          <ul className="cards">
            {projects.map((p) => (
              <li key={p.id} className="card" data-testid="tarjeta-proyecto">
                <a href={hrefFor(p.isModel ? { name: 'modelo', id: p.id } : { name: 'proyecto', id: p.id, view: 'plano' })} className="card__open" data-testid="abrir-proyecto">
                  <Thumbnail outline={p.outline} />
                  <span className="card__name">{p.name}</span>
                  <span className="card__meta">
                    {p.isModel ? 'Modelo 3D importado' : `${p.walls} muros · ${p.rooms} estancias`} · {when(p.updatedAt)}
                  </span>
                </a>
                {confirming === p.id ? (
                  <div className="card__confirm" role="alertdialog" aria-label={`Eliminar ${p.name}`}>
                    <span>¿Eliminar del dispositivo? No se puede deshacer.</span>
                    <button type="button" className="btn btn--dark btn--small" data-testid="confirmar-eliminar" onClick={() => void remove(p.id)}>
                      Eliminar
                    </button>
                    <button type="button" className="btn btn--outline btn--small" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button type="button" className="link card__delete" data-testid="eliminar-proyecto" onClick={() => setConfirming(p.id)}>
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
