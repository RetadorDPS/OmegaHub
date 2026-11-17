import { useMemo } from 'react';
import { patchMeta } from '../editor/store';
import { DEFAULT_PRESENTATION, type Presentation, type Project } from '../model/types';
import type { Validation } from '../model/validate';
import { navigate } from '../router';
import { buildProjectScene } from '../viewer/sceneDef';
import { encodeProject, MAX_LINK_CHARS, shareUrl } from '../share/link';
import { Viewer } from '../viewer/Viewer';

/**
 * Visor de un proyecto del usuario. La escena se reconstruye a partir de la
 * geometría del proyecto; los acabados se cambian sin regenerarla.
 */
export default function ProjectViewer({ project, validation }: { project: Project; validation: Validation }) {
  const { walls, openings, slab, rooms, name, id, presentation } = project;
  const def = useMemo(
    () => buildProjectScene(project),
    // Solo la geometría, el nombre y la presentación regeneran el modelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, openings, slab, rooms, name, id, presentation],
  );
  const pres: Presentation = { ...DEFAULT_PRESENTATION, ...(presentation ?? {}) };
  const setPres = (patch: Partial<Presentation>) => patchMeta({ presentation: { ...pres, ...patch } });
  const placed = def.furnishing?.filter((f) => f.items > 0).length ?? 0;
  const presentationPanel = (
    <fieldset className="finish-group">
      <legend>Presentación</legend>
      <div className="finish-group__options">
        <button type="button" className="swatch" aria-pressed={pres.furnish} data-testid="pres-amueblar" onClick={() => setPres({ furnish: !pres.furnish })}>
          Amueblar <span className="tag">Ilustrativo</span>
        </button>
        <button type="button" className="swatch" aria-pressed={pres.roof} data-testid="pres-cubierta" onClick={() => setPres({ roof: !pres.roof })}>
          Cubierta
        </button>
        <button type="button" className="swatch" aria-pressed={pres.ambience === 'dusk'} data-testid="pres-atardecer" onClick={() => setPres({ ambience: 'dusk' })}>
          Atardecer
        </button>
        <button type="button" className="swatch" aria-pressed={pres.ambience === 'day'} data-testid="pres-dia" onClick={() => setPres({ ambience: 'day' })}>
          Día
        </button>
      </div>
      <p className="panel__hint">
        {pres.furnish
          ? `Muebles de ejemplo en ${placed} estancia${placed === 1 ? '' : 's'}, elegidos por el nombre (dormitorio, salón, cocina, baño, estudio…). No forman parte del proyecto.`
          : 'Sin amueblar: el modelo muestra solo lo que has trazado.'}
      </p>
    </fieldset>
  );
  const toPlan = () => navigate({ name: 'proyecto', id, view: 'plano' });
  const notices = validation.canWalk
    ? []
    : [
        'Este modelo aún no se puede recorrer a pie.',
        ...validation.issues.filter((i) => i.fix === 'room').map((i) => i.message),
        'Vuelve al plano para corregirlo; mientras tanto puedes ver el exterior y la maqueta.',
      ];
  return (
    <Viewer
      def={def}
      onExit={toPlan}
      exitLabel="Volver al plano"
      secondary={{ label: 'Editar plano', onClick: toPlan }}
      finishes={project.finishes}
      onFinishesChange={(finishes) => patchMeta({ finishes })}
      notices={notices}
      fallback={{ label: 'Volver al plano 2D', onClick: toPlan }}
      presentationPanel={presentationPanel}
      share={async () => {
        const token = await encodeProject(project);
        if (token.length > MAX_LINK_CHARS) throw new Error('El proyecto es demasiado grande para compartirlo por enlace.');
        return shareUrl(token);
      }}
    />
  );
}
