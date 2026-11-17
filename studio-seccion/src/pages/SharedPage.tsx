import { useEffect, useMemo, useState } from 'react';
import { createProject } from '../model/project';
import type { Finishes, Project } from '../model/types';
import { validateProject } from '../model/validate';
import { hrefFor, navigate } from '../router';
import { decodeProject, shareUrl } from '../share/link';
import { saveProject } from '../storage/db';
import { buildProjectScene } from '../viewer/sceneDef';
import { Viewer } from '../viewer/Viewer';

/** Recorrido recibido por enlace: solo visualización, con opción de guardar una copia propia. */
export default function SharedPage({ token }: { token: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishes, setFinishes] = useState<Finishes | null>(null);

  useEffect(() => {
    decodeProject(token)
      .then((p) => {
        setProject(p);
        setFinishes(p.finishes);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const validation = useMemo(() => (project ? validateProject(project) : null), [project]);
  const def = useMemo(() => (project && validation?.canGenerate ? buildProjectScene(project) : null), [project, validation]);

  if (error || (validation && !validation.canGenerate)) {
    return (
      <main className="blocked" role="alert">
        <h1>No se puede abrir este recorrido</h1>
        <p>{error ?? 'El enlace contiene un modelo incompleto.'}</p>
        <a className="btn btn--dark" href={hrefFor({ name: 'portada' })}>
          Ir a Studio Sección
        </a>
      </main>
    );
  }
  if (!project || !def || !finishes) {
    return (
      <div className="loading" role="status">
        <b>Studio Sección</b>
        <span>Abriendo el recorrido…</span>
      </div>
    );
  }
  const saveCopy = async () => {
    const copy: Project = { ...createProject(project.name), walls: project.walls, openings: project.openings, slab: project.slab, rooms: project.rooms, finishes };
    await saveProject(copy);
    navigate({ name: 'proyecto', id: copy.id, view: 'plano' });
  };
  return (
    <Viewer
      def={def}
      onExit={() => navigate({ name: 'portada' })}
      exitLabel="Studio Sección"
      secondary={{ label: 'Guardar una copia', onClick: () => void saveCopy() }}
      finishes={finishes}
      onFinishesChange={setFinishes}
      share={async () => shareUrl(token)}
      fallback={{ label: 'Ir a Studio Sección', onClick: () => navigate({ name: 'portada' }) }}
    />
  );
}
