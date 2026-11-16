import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Finishes } from '../model/types';
import { ViewerController } from './controller';
import { EXTERIOR_WALL_FINISHES, FLOOR_FINISHES, INTERIOR_WALL_FINISHES, type FinishPreset } from './finishes';
import { MaterialSet } from './materials';
import { SceneCanvas, hasWebGL } from './SceneCanvas';
import type { SceneDef } from './sceneDef';
import { prefersReducedMotion, resetViewerUI, useViewer, type Mode, type Quality } from './store';

export interface ViewerProps {
  def: SceneDef;
  onExit: () => void;
  exitLabel: string;
  /** Acción secundaria de la barra (p. ej. «Editar plano»). */
  secondary?: { label: string; onClick: () => void };
  finishes: Finishes;
  onFinishesChange: (f: Finishes) => void;
  /** Avisos que explican qué falta (p. ej. sin punto interior válido). */
  notices?: string[];
  /** Enlace alternativo cuando no hay WebGL. */
  fallback?: { label: string; onClick: () => void };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const MODE_LABEL: Record<Mode, string> = {
  guia: 'Guía',
  orbita: 'Libre',
  caminar: 'Libre',
  maqueta: 'Maqueta',
  obra: 'Obra',
};

function Icon({ name }: { name: 'prev' | 'next' | 'play' | 'pause' | 'reset' | 'help' | 'close' | 'back' | 'swatch' }) {
  const paths: Record<string, string> = {
    prev: 'M14.5 5.5 8 12l6.5 6.5',
    next: 'M9.5 5.5 16 12l-6.5 6.5',
    play: 'M8 5.5v13l10.5-6.5z',
    pause: 'M8 5.5v13M16 5.5v13',
    reset: 'M5 12a7 7 0 1 0 2.2-5.1M5 4.5v3.6h3.6',
    help: 'M9.4 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.5-1.3 1-1.3 2M12 17.2v.1',
    close: 'M6 6l12 12M18 6 6 18',
    back: 'M11 5.5 4.5 12l6.5 6.5M5 12h14.5',
    swatch: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} fill={name === 'play' ? 'currentColor' : 'none'} />
    </svg>
  );
}

/** Mando táctil: adelante/atrás y giro. */
function Joystick({ controller }: { controller: ViewerController }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const move = (e: ReactPointerEvent) => {
    const el = ref.current;
    if (!el || active.current !== e.pointerId) return;
    const r = el.getBoundingClientRect();
    const max = r.width / 2;
    let x = (e.clientX - (r.left + max)) / max;
    let y = (e.clientY - (r.top + max)) / max;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    controller.setJoystick(Math.abs(x) < 0.15 ? 0 : x, Math.abs(y) < 0.15 ? 0 : y);
  };
  const end = (e: ReactPointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    setKnob({ x: 0, y: 0 });
    controller.setJoystick(0, 0);
  };
  useEffect(() => () => controller.setJoystick(0, 0), [controller]);

  return (
    <div
      ref={ref}
      className="joystick"
      data-testid="joystick"
      role="application"
      aria-label="Mando para caminar: arriba avanza, abajo retrocede, los lados giran"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="joystick__knob" style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

function FinishGroup({
  title,
  list,
  value,
  onPick,
}: {
  title: string;
  list: FinishPreset[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="finish-group">
      <legend>{title}</legend>
      <div className="finish-group__options">
        {list.map((f) => (
          <button
            key={f.id}
            type="button"
            className="swatch"
            aria-pressed={value === f.id}
            data-testid={`acabado-${f.id}`}
            onClick={() => onPick(f.id)}
          >
            <span className="swatch__chip" style={{ background: f.color }} />
            {f.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Viewer({ def, onExit, exitLabel, secondary, finishes, onFinishesChange, notices = [], fallback }: ViewerProps) {
  const ui = useViewer();
  const webgl = useMemo(() => hasWebGL(), []);
  const controller = useMemo(() => new ViewerController(def), [def]);
  const materials = useMemo(() => new MaterialSet(finishes, def.groundColor), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    resetViewerUI({ stage: 0 });
    return () => materials.dispose();
  }, [def, materials]);

  useEffect(() => {
    materials.setFinishes(finishes);
    useViewer.setState((s) => ({ tick: s.tick + 1 }));
  }, [finishes, materials]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 820px)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // Gancho de solo lectura para las pruebas automáticas.
    (window as unknown as { __studio?: unknown }).__studio = { controller, def };
    return () => {
      delete (window as unknown as { __studio?: unknown }).__studio;
    };
  }, [controller, def]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useViewer.setState({ helpOpen: false, finishesOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { tour, stages } = def;
  const stop = tour.stops[Math.min(ui.stop, tour.stops.length - 1)];
  const stage = stages[ui.stage];
  const free = ui.mode === 'orbita' || ui.mode === 'caminar';
  const canWalk = def.entryPoints.length > 0;
  const reduced = prefersReducedMotion();

  const pickMode = (m: 'guia' | 'libre' | 'maqueta' | 'obra') => {
    if (m === 'libre') {
      if (ui.mode === 'guia') controller.release();
      else if (!free) controller.setMode('orbita');
    } else controller.setMode(m);
  };
  const activeTab = free ? 'libre' : ui.mode;

  return (
    <div className="viewer" data-mode={ui.mode} data-testid="viewer" data-ready={ui.ready}>
      <div className="viewer__stage">
        {webgl ? (
          <SceneCanvas def={def} materials={materials} controller={controller} />
        ) : (
          <div className="viewer__nowebgl" role="alert">
            <h2>Este dispositivo no puede mostrar la vista 3D</h2>
            <p>
              El navegador no ofrece WebGL (puede estar desactivado o no tener aceleración gráfica). El resto de la
              aplicación sigue disponible.
            </p>
            {fallback && (
              <button type="button" className="btn btn--light" onClick={fallback.onClick}>
                {fallback.label}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="viewer__fade" data-on={ui.fade} aria-hidden="true" />

      <header className="vbar">
        <button type="button" className="vbar__back" onClick={onExit} data-testid="salir">
          <Icon name="back" />
          <span>{exitLabel}</span>
        </button>
        <span className="vbar__title">{def.title}</span>
        <nav className="vbar__modes" aria-label="Modo de visualización">
          {(['guia', 'libre', 'maqueta', 'obra'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={activeTab === m}
              data-testid={`modo-${m}`}
              onClick={() => pickMode(m)}
            >
              {m === 'libre' ? 'Libre' : MODE_LABEL[m]}
            </button>
          ))}
        </nav>
        <div className="vbar__actions">
          {secondary && (
            <button type="button" className="vbar__text" onClick={secondary.onClick} data-testid="accion-secundaria">
              {secondary.label}
            </button>
          )}
          <button
            type="button"
            className="vbar__icon"
            aria-label="Acabados"
            aria-expanded={ui.finishesOpen}
            data-testid="abrir-acabados"
            onClick={() => useViewer.setState({ finishesOpen: !ui.finishesOpen, helpOpen: false })}
          >
            <Icon name="swatch" />
          </button>
          <button
            type="button"
            className="vbar__icon"
            aria-label="Ayuda y controles"
            aria-expanded={ui.helpOpen}
            data-testid="abrir-ayuda"
            onClick={() => useViewer.setState({ helpOpen: !ui.helpOpen, finishesOpen: false })}
          >
            <Icon name="help" />
          </button>
        </div>
      </header>

      {free && (
        <div className="free-badge" role="status" data-testid="insignia-libre">
          <span className="free-badge__dot" />
          Modo libre · {ui.mode === 'caminar' ? 'a pie' : 'órbita'}
        </div>
      )}

      {notices.length > 0 && (
        <div className="viewer__notices" role="status">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      {ui.mode === 'caminar' && coarse && <Joystick controller={controller} />}

      <footer className="vfoot" data-testid="pie">
        {ui.mode === 'guia' && (
          <>
            <div className="vfoot__caption">
              <span className="vfoot__index" data-testid="capitulo-indice">
                {pad2(ui.stop + 1)} / {pad2(tour.stops.length)}
              </span>
              <div>
                <h2 className="vfoot__chapter" data-testid="capitulo">
                  {stop.chapter}
                </h2>
                <p className="vfoot__label" data-testid="estancia">
                  {stop.label}
                </p>
                {stop.note && <p className="vfoot__note">{stop.note}</p>}
              </div>
            </div>
            <div className="vfoot__controls">
              <ol className="dots" aria-label="Capítulos">
                {tour.stops.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-label={`Ir a ${s.chapter}`}
                      aria-current={i === ui.stop ? 'step' : undefined}
                      onClick={() => controller.goToStop(i)}
                    />
                  </li>
                ))}
              </ol>
              <div className="transport">
                <button type="button" aria-label="Capítulo anterior" data-testid="anterior" disabled={ui.stop === 0 && !ui.moving} onClick={() => controller.prev()}>
                  <Icon name="prev" />
                </button>
                <button
                  type="button"
                  className="transport__main"
                  aria-label={ui.playing || ui.moving ? 'Pausar la visita' : 'Iniciar la visita'}
                  data-testid="reproducir"
                  data-playing={ui.playing}
                  onClick={() => controller.togglePlay()}
                >
                  <Icon name={ui.playing || ui.moving ? 'pause' : 'play'} />
                </button>
                <button
                  type="button"
                  aria-label="Capítulo siguiente"
                  data-testid="siguiente"
                  disabled={ui.stop === tour.stops.length - 1 && !ui.moving}
                  onClick={() => controller.next()}
                >
                  <Icon name="next" />
                </button>
              </div>
              <button type="button" className="btn btn--ghost" data-testid="explorar-libre" onClick={() => controller.release()}>
                Explorar libre
              </button>
            </div>
          </>
        )}

        {free && (
          <>
            <div className="vfoot__caption">
              <span className="vfoot__index">Libre</span>
              <div>
                <h2 className="vfoot__chapter">{ui.mode === 'caminar' ? 'Recorre el interior' : 'Órbita exterior'}</h2>
                <p className="vfoot__label">
                  {ui.mode === 'caminar'
                    ? coarse
                      ? 'Arrastra para mirar · usa el mando para caminar'
                      : 'Arrastra para mirar · W A S D o flechas para caminar'
                    : 'Arrastra para girar · rueda o pellizco para acercarte'}
                </p>
              </div>
            </div>
            <div className="vfoot__controls vfoot__controls--wrap">
              <div className="chips" role="group" aria-label="Puntos de entrada">
                <button type="button" aria-pressed={ui.mode === 'orbita'} data-testid="libre-orbita" onClick={() => controller.setMode('orbita')}>
                  Órbita
                </button>
                {def.entryPoints.map((e) => (
                  <button key={e.id} type="button" data-testid={`entrar-${e.id}`} onClick={() => controller.enterAt(e.id)}>
                    {e.name}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn--ghost btn--icon" data-testid="reiniciar" onClick={() => controller.reset()}>
                <Icon name="reset" />
                Reiniciar cámara
              </button>
              <button type="button" className="btn btn--light" data-testid="volver-guia" onClick={() => controller.setMode('guia')}>
                Volver a la guía
              </button>
            </div>
          </>
        )}

        {ui.mode === 'maqueta' && (
          <>
            <div className="vfoot__caption">
              <span className="vfoot__index">Maqueta</span>
              <div>
                <h2 className="vfoot__chapter">Distribución</h2>
                <p className="vfoot__label">
                  {def.hasRoof ? 'Vista superior con la cubierta retirada' : 'Vista superior · el modelo no incluye cubierta'}
                </p>
              </div>
            </div>
            <div className="vfoot__controls vfoot__controls--wrap">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={ui.showDimensions}
                  data-testid="cotas"
                  onChange={(e) => useViewer.setState({ showDimensions: e.target.checked })}
                />
                Cotas de muros
              </label>
              <button type="button" className="btn btn--ghost btn--icon" onClick={() => controller.reset()}>
                <Icon name="reset" />
                Reiniciar cámara
              </button>
              {canWalk && (
                <button type="button" className="btn btn--light" onClick={() => controller.setMode('caminar')}>
                  Entrar a pie
                </button>
              )}
            </div>
          </>
        )}

        {ui.mode === 'obra' && (
          <>
            <div className="vfoot__caption">
              <span className="vfoot__index" data-testid="etapa-indice">
                {pad2(ui.stage + 1)} / {pad2(stages.length)}
              </span>
              <div>
                <h2 className="vfoot__chapter" data-testid="etapa">
                  {stage.title}
                  {stage.illustrative && <span className="tag">Ilustrativo</span>}
                </h2>
                <p className="vfoot__note">{stage.note}</p>
                <p className="vfoot__disclaimer">Visualización por etapas · no es una simulación estructural ni un plan de obra.</p>
              </div>
            </div>
            <div className="vfoot__controls vfoot__controls--wrap">
              <div className="transport">
                <button type="button" aria-label="Etapa anterior" data-testid="etapa-anterior" disabled={ui.stage === 0} onClick={() => controller.setStage(ui.stage - 1)}>
                  <Icon name="prev" />
                </button>
                <button
                  type="button"
                  aria-label="Etapa siguiente"
                  data-testid="etapa-siguiente"
                  disabled={ui.stage === stages.length - 1}
                  onClick={() => controller.setStage(ui.stage + 1)}
                >
                  <Icon name="next" />
                </button>
              </div>
              <ol className="timeline" aria-label="Etapas de obra">
                {stages.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={i === ui.stage ? 'step' : undefined}
                      data-done={i < ui.stage}
                      data-testid={`etapa-${s.id}`}
                      onClick={() => controller.setStage(i)}
                    >
                      <span className="timeline__n">{pad2(i + 1)}</span>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </footer>

      <aside className="panel" data-open={ui.finishesOpen} aria-hidden={!ui.finishesOpen} aria-label="Acabados">
        <div className="panel__head">
          <h3>Acabados</h3>
          <button type="button" className="vbar__icon" aria-label="Cerrar" onClick={() => useViewer.setState({ finishesOpen: false })}>
            <Icon name="close" />
          </button>
        </div>
        <p className="panel__hint">
          Opciones predefinidas para comparar ambientes. {def.kind === 'proyecto' ? 'Se guardan con el proyecto en este dispositivo.' : ''}
        </p>
        <FinishGroup title="Paredes interiores" list={INTERIOR_WALL_FINISHES} value={finishes.interiorWall} onPick={(id) => onFinishesChange({ ...finishes, interiorWall: id })} />
        <FinishGroup title="Fachada" list={EXTERIOR_WALL_FINISHES} value={finishes.exteriorWall} onPick={(id) => onFinishesChange({ ...finishes, exteriorWall: id })} />
        <FinishGroup title="Pavimento" list={FLOOR_FINISHES} value={finishes.floor} onPick={(id) => onFinishesChange({ ...finishes, floor: id })} />
      </aside>

      <aside className="panel" data-open={ui.helpOpen} aria-hidden={!ui.helpOpen} aria-label="Ayuda y controles">
        <div className="panel__head">
          <h3>Controles</h3>
          <button type="button" className="vbar__icon" aria-label="Cerrar" onClick={() => useViewer.setState({ helpOpen: false })}>
            <Icon name="close" />
          </button>
        </div>
        <dl className="help">
          <dt>Guía</dt>
          <dd>Botones, flechas ← → o rueda sobre la escena para cambiar de capítulo. Espacio inicia o pausa.</dd>
          <dt>Libre · órbita</dt>
          <dd>Arrastra para girar alrededor del edificio; rueda o pellizco para acercarte.</dd>
          <dt>Libre · a pie</dt>
          <dd>Arrastra para mirar. Camina con W A S D o las flechas (Mayús corre); en táctil, con el mando. Los muros detienen el paso; las puertas no.</dd>
          <dt>Maqueta</dt>
          <dd>Vista superior sin cubierta, con cotas de muros opcionales.</dd>
          <dt>Obra</dt>
          <dd>Etapas seleccionables y reversibles. Es una visualización, no una simulación estructural.</dd>
          <dt>Atajos</dt>
          <dd>G guía · L libre · M maqueta · O obra · R reiniciar cámara.</dd>
        </dl>
        <fieldset className="finish-group">
          <legend>Calidad de imagen</legend>
          <div className="finish-group__options">
            {(['alta', 'media', 'baja'] as Quality[]).map((q) => (
              <button key={q} type="button" className="swatch" aria-pressed={ui.quality === q} data-testid={`calidad-${q}`} onClick={() => useViewer.setState({ quality: q })}>
                {q === 'alta' ? 'Alta' : q === 'media' ? 'Media' : 'Baja'}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="panel__hint">
          {reduced ? 'Tu sistema pide menos movimiento: los cambios de cámara se hacen con fundidos. ' : ''}
          La escena se genera en tu navegador con geometría y materiales procedurales; no es un render fotorrealista con
          iluminación precalculada.
        </p>
      </aside>

      {ui.toast && (
        <div className="toast" role="status" data-testid="aviso">
          {ui.toast}
        </div>
      )}
    </div>
  );
}

export default Viewer;
