import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { formatMeters, polygonArea, wallLength } from '../model/geometry';
import { openingSpan } from '../model/project';
import { validateProject, type Issue } from '../model/validate';
import { MAX_FILE_BYTES } from './planFile';
import { attachPlanFile, attachSamplePlan, changePlanPage, removePlan } from './planActions';
import { PlanCanvas, type PlanCanvasHandle } from './PlanCanvas';
import {
  applyCalibration,
  closeSlab,
  deleteSelection,
  isScaled,
  patchMeta,
  proposeSlab,
  redo,
  select,
  setSlabThickness,
  setTool,
  setWallLength,
  undo,
  updateOpening,
  updateRoom,
  updateWall,
  useEditor,
  type Tool,
} from './store';

const TOOLS: { id: Tool; label: string; key: string; hint: string; icon: string }[] = [
  { id: 'select', label: 'Seleccionar', key: 'V', icon: 'M5 3l13 7.5-5.6 1.4L15.6 19l-2.6 1.2-3.1-7-4 3.6z', hint: 'Haz clic en un muro, hueco, estancia o en la losa para editarlo. Arrastra sus puntos para moverlos; arrastra el fondo para desplazar la vista.' },
  { id: 'calibrate', label: 'Escala', key: 'C', icon: 'M3 16l13-13 5 5L8 21zM7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2', hint: 'Marca dos puntos del plano cuya distancia real conozcas y escribe esa longitud en metros.' },
  { id: 'wall', label: 'Muro', key: 'M', icon: 'M3 7h18v10H3zM3 12h18M9 7v5M15 12v5', hint: 'Clic para empezar y clic en cada esquina. Termina con doble clic, Intro o volviendo al primer punto. Se endereza a horizontal/vertical y se imanta a extremos.' },
  { id: 'door', label: 'Puerta', key: 'P', icon: 'M5 20V4h9v16M5 20h14M14 4a9 9 0 0 1 5 8', hint: 'Haz clic sobre un muro para abrir una puerta. Después puedes arrastrarla a lo largo del muro.' },
  { id: 'window', label: 'Ventana', key: 'N', icon: 'M4 5h16v14H4zM12 5v14M4 12h16', hint: 'Haz clic sobre un muro para colocar una ventana.' },
  { id: 'slab', label: 'Losa', key: 'L', icon: 'M4 8l8-4 8 4-8 4zM4 8v5l8 4 8-4V8', hint: 'Marca los vértices del contorno. Ciérralo volviendo al primer punto o con «Cerrar contorno».' },
  { id: 'room', label: 'Estancia', key: 'E', icon: 'M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10zM12 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', hint: 'Haz clic dentro de una habitación para nombrarla. Ese punto será la posición de cámara al entrar a pie.' },
  { id: 'pan', label: 'Mover', key: 'H', icon: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3', hint: 'Arrastra para desplazar el plano. Rueda o pellizco para acercar.' },
];

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Campo numérico en metros: admite coma decimal y confirma con Intro o al salir. */
function MetersField({
  label,
  value,
  onCommit,
  testId,
  step = 0.05,
  min = 0,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  testId?: string;
  step?: number;
  min?: number;
}) {
  const shown = value.toFixed(2).replace('.', ',');
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  const parse = () => {
    const v = Number(text.replace(',', '.').trim());
    if (Number.isFinite(v) && v >= min) onCommit(v);
    else setText(shown);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field__input">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          data-testid={testId}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setFocused(false);
            parse();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              parse();
              e.currentTarget.blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const v = Number(text.replace(',', '.'));
              if (Number.isFinite(v)) {
                const next = Math.max(min, Math.round((v + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000);
                setText(next.toFixed(2).replace('.', ','));
                onCommit(next);
              }
            }
          }}
        />
        <em>m</em>
      </span>
    </label>
  );
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="insp__section" data-testid={testId}>
      <h3 className="mono">{title}</h3>
      {children}
    </section>
  );
}

function StartScreen({ onBlank }: { onBlank: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async (job: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setError(await job());
    setBusy(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void run(() => attachPlanFile(file));
  };

  return (
    <div className="start" data-testid="inicio-plano">
      <div className="start__card">
        <p className="mono start__step">Paso 1 de 4 · Plano</p>
        <h2>Sube el plano de una planta</h2>
        <p className="start__lede">
          Lo usarás como fondo para trazar encima. No se interpreta automáticamente ni sale de este navegador.
        </p>
        <div
          className="dropzone"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <p>
            Arrastra aquí un <b>PDF</b>, <b>PNG</b> o <b>JPG</b>
          </p>
          <button type="button" className="btn btn--dark" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Abriendo…' : 'Elegir archivo'}
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            data-testid="archivo-plano"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void run(() => attachPlanFile(file));
            }}
          />
          <p className="dropzone__limit">Hasta {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. En PDF de varias páginas podrás elegir cuál.</p>
        </div>
        {error && (
          <p className="start__error" role="alert" data-testid="error-plano">
            {error}
          </p>
        )}
        <div className="start__alt">
          <span>¿Sin plano a mano?</span>
          <button type="button" className="link" disabled={busy} data-testid="ejemplo-pdf" onClick={() => run(() => attachSamplePlan('./ejemplos/plano-en-L.pdf', 'plano-en-L.pdf'))}>
            Plano de ejemplo (PDF)
          </button>
          <button type="button" className="link" disabled={busy} data-testid="ejemplo-png" onClick={() => run(() => attachSamplePlan('./ejemplos/plano-en-L.png', 'plano-en-L.png'))}>
            Plano de ejemplo (PNG)
          </button>
          <button type="button" className="link" disabled={busy} data-testid="sin-plano" onClick={onBlank}>
            Trazar sin fondo, sobre cuadrícula de 1 m
          </button>
        </div>
      </div>
    </div>
  );
}

function CalibrationPanel() {
  const project = useEditor((s) => s.project)!;
  const cal = useEditor((s) => s.calibration);
  const tool = useEditor((s) => s.tool);
  const [meters, setMeters] = useState('');
  const unit = project.plan?.kind === 'pdf' ? 'página' : 'imagen';

  if (tool !== 'calibrate') {
    return project.calibration ? (
      <p className="insp__ok" data-testid="escala-ok">
        Escala calibrada con un tramo de {formatMeters(project.calibration.meters)}. Vale solo para esta {unit}.
        <button type="button" className="link" onClick={() => setTool('calibrate')}>
          Recalibrar
        </button>
      </p>
    ) : (
      <p className="insp__warn" data-testid="escala-falta">
        Sin escala no hay cotas en metros ni se puede trazar.
        <button type="button" className="btn btn--dark btn--small" data-testid="ir-calibrar" onClick={() => setTool('calibrate')}>
          Calibrar escala
        </button>
      </p>
    );
  }
  const step = !cal.a ? 1 : !cal.b ? 2 : 3;
  return (
    <div className="cal" data-testid="panel-escala">
      <ol className="cal__steps">
        <li data-done={step > 1} data-current={step === 1}>
          Marca el primer punto sobre el plano.
        </li>
        <li data-done={step > 2} data-current={step === 2}>
          Marca el segundo punto.
        </li>
        <li data-current={step === 3}>Indica la distancia real entre ambos.</li>
      </ol>
      <form
        className="cal__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (applyCalibration(Number(meters.replace(',', '.')))) setMeters('');
        }}
      >
        <label className="field">
          <span>Longitud real</span>
          <span className="field__input">
            <input
              type="text"
              inputMode="decimal"
              placeholder="p. ej. 4"
              value={meters}
              disabled={step < 3}
              data-testid="escala-metros"
              onChange={(e) => setMeters(e.target.value)}
            />
            <em>m</em>
          </span>
        </label>
        <button type="submit" className="btn btn--dark btn--small" disabled={step < 3 || !meters.trim()} data-testid="escala-aplicar">
          Aplicar escala
        </button>
      </form>
      <p className="insp__note">
        La escala se aplica únicamente a esta {unit}. No se deduce del tamaño del papel ni del archivo.
        {project.calibration ? ' Al recalibrar, lo ya trazado se reajusta para seguir sobre el mismo dibujo.' : ''}
      </p>
    </div>
  );
}

function SelectionPanel() {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const scaled = isScaled(project);
  if (!selection) {
    return <p className="insp__note">Nada seleccionado. Con «Seleccionar», haz clic en un elemento para ver y cambiar sus medidas.</p>;
  }
  const remove = (
    <button type="button" className="btn btn--outline btn--small insp__delete" data-testid="borrar" onClick={deleteSelection}>
      Borrar
    </button>
  );
  if (selection.type === 'wall') {
    const wall = project.walls.find((w) => w.id === selection.id);
    if (!wall) return null;
    return (
      <div className="insp__grid" data-testid="props-muro">
        {scaled && <MetersField label="Largo" value={wallLength(wall)} testId="muro-largo" min={0.1} onCommit={(v) => setWallLength(wall.id, v)} />}
        <MetersField label="Grosor" value={wall.thickness} testId="muro-grosor" step={0.01} min={0.05} onCommit={(v) => updateWall(wall.id, { thickness: v })} />
        <MetersField label="Altura" value={wall.height} testId="muro-altura" min={0.5} onCommit={(v) => updateWall(wall.id, { height: v })} />
        <p className="insp__note">El largo se ajusta desplazando el extremo final; las esquinas unidas se mueven con él. También puedes arrastrar los extremos.</p>
        {remove}
      </div>
    );
  }
  if (selection.type === 'opening') {
    const o = project.openings.find((x) => x.id === selection.id);
    const wall = o && project.walls.find((w) => w.id === o.wallId);
    if (!o || !wall) return null;
    const [u0] = openingSpan(o);
    return (
      <div className="insp__grid" data-testid="props-hueco">
        <p className="insp__kind">{o.kind === 'door' ? 'Puerta' : 'Ventana'} en muro de {formatMeters(wallLength(wall))}</p>
        <MetersField label="Distancia al inicio del muro" value={u0} testId="hueco-posicion" onCommit={(v) => updateOpening(o.id, { offset: v + o.width / 2 })} />
        <MetersField label="Ancho" value={o.width} testId="hueco-ancho" min={0.3} onCommit={(v) => updateOpening(o.id, { width: v })} />
        <MetersField label="Alto" value={o.height} testId="hueco-alto" min={0.3} onCommit={(v) => updateOpening(o.id, { height: v })} />
        {o.kind === 'window' && <MetersField label="Antepecho" value={o.sill} testId="hueco-antepecho" onCommit={(v) => updateOpening(o.id, { sill: v })} />}
        {remove}
      </div>
    );
  }
  if (selection.type === 'room') {
    const r = project.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    return (
      <div className="insp__grid" data-testid="props-estancia">
        <label className="field field--wide">
          <span>Nombre</span>
          <span className="field__input">
            <input type="text" value={r.name} maxLength={40} data-testid="estancia-nombre" onChange={(e) => updateRoom(r.id, { name: e.target.value })} />
          </span>
        </label>
        <p className="insp__note">El círculo es el punto de cámara para entrar a pie. Arrástralo para colocarlo dentro de la estancia.</p>
        {remove}
      </div>
    );
  }
  const slab = project.slab;
  if (!slab) return null;
  return (
    <div className="insp__grid" data-testid="props-losa">
      <p className="insp__kind">
        Losa {slab.closed ? `cerrada · ${polygonArea(slab.points).toFixed(1).replace('.', ',')} m²` : `abierta · ${slab.points.length} puntos`}
      </p>
      <MetersField label="Espesor" value={slab.thickness} testId="losa-espesor" min={0.05} onCommit={setSlabThickness} />
      {remove}
    </div>
  );
}

const FIX_TOOL: Record<Issue['fix'], Tool> = { calibrate: 'calibrate', wall: 'wall', slab: 'slab', room: 'room', select: 'select' };

export function Editor({ onGenerate }: { onGenerate: () => void }) {
  const project = useEditor((s) => s.project)!;
  const tool = useEditor((s) => s.tool);
  const notice = useEditor((s) => s.notice);
  const chain = useEditor((s) => s.chain);
  const rasterBusy = useEditor((s) => s.rasterBusy);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const canvas = useRef<PlanCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [blank, setBlank] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const validation = useMemo(() => validateProject(project), [project]);
  const scaled = isScaled(project);
  const slab = project.slab;
  const showStart = !project.plan && project.walls.length === 0 && !blank && !rasterBusy;
  const errors = validation.issues.filter((i) => i.level === 'error');
  const warnings = validation.issues.filter((i) => i.level === 'aviso');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        if (typing) return;
        e.preventDefault();
        redo();
        return;
      }
      if (typing || mod || e.altKey) return;
      const st = useEditor.getState();
      if (key === 'escape') {
        if (st.chain) useEditor.setState({ chain: null });
        else if (st.tool !== 'select') setTool('select');
        else select(null);
        return;
      }
      if (key === 'enter') {
        if (st.tool === 'wall' && st.chain) useEditor.setState({ chain: null });
        else if (st.tool === 'slab' && st.project?.slab && !st.project.slab.closed) closeSlab();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (st.selection) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      }
      const match = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (match && (match.id !== 'calibrate' || st.project?.plan)) setTool(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? '';
  const fixIssue = (issue: Issue) => {
    if (issue.ref && issue.ref.type !== 'slab') {
      setTool('select');
      select({ type: issue.ref.type, id: issue.ref.id });
    } else if (issue.ref?.type === 'slab') {
      setTool('select');
      select({ type: 'slab' });
    } else setTool(FIX_TOOL[issue.fix]);
    setPanelOpen(true);
  };

  return (
    <div className="editor" data-testid="editor" data-panel={panelOpen}>
      <nav className="tools" aria-label="Herramientas de trazado">
        {TOOLS.filter((t) => t.id !== 'calibrate' || project.plan).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            title={`${t.label} (${t.key})`}
            data-testid={`herramienta-${t.id}`}
            disabled={showStart}
            onClick={() => setTool(t.id)}
          >
            <Glyph d={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
        <span className="tools__sep" />
        <button type="button" title="Deshacer (Ctrl+Z)" data-testid="deshacer" disabled={!canUndo} onClick={undo}>
          <Glyph d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12" />
          <span>Deshacer</span>
        </button>
        <button type="button" title="Rehacer (Ctrl+Mayús+Z)" data-testid="rehacer" disabled={!canRedo} onClick={redo}>
          <Glyph d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12" />
          <span>Rehacer</span>
        </button>
      </nav>

      <div className="stage">
        {showStart ? (
          <StartScreen onBlank={() => setBlank(true)} />
        ) : (
          <>
            <PlanCanvas handle={canvas} />
            {rasterBusy && (
              <p className="stage__busy" role="status">
                Preparando el plano…
              </p>
            )}
            <div className="stage__zoom" role="group" aria-label="Zoom del plano">
              <button type="button" aria-label="Alejar" onClick={() => canvas.current?.zoomBy(1 / 1.3)}>
                −
              </button>
              <button type="button" aria-label="Acercar" onClick={() => canvas.current?.zoomBy(1.3)}>
                +
              </button>
              <button type="button" className="stage__fit" data-testid="encajar" onClick={() => canvas.current?.fit()}>
                Encajar
              </button>
            </div>
            <p className="stage__hint" data-testid="pista">
              {tool === 'wall' && chain ? 'Clic para añadir el siguiente tramo. Intro o doble clic para terminar; vuelve al primer punto para cerrar.' : hint}
            </p>
            {tool === 'slab' && slab && !slab.closed && slab.points.length >= 3 && (
              <button type="button" className="btn btn--dark stage__action" data-testid="cerrar-contorno" onClick={() => closeSlab()}>
                Cerrar contorno
              </button>
            )}
          </>
        )}
        {notice && (
          <div className={`notice notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="aviso-editor">
            {notice.text}
          </div>
        )}
        <button type="button" className="stage__panel-toggle btn btn--dark btn--small" onClick={() => setPanelOpen(!panelOpen)} data-testid="alternar-panel">
          {panelOpen ? 'Ver plano' : `Medidas y comprobación${errors.length ? ` · ${errors.length}` : ''}`}
        </button>
      </div>

      <aside className="insp" aria-label="Propiedades y comprobación">
        <Section title="Plano de fondo" testId="seccion-plano">
          {project.plan ? (
            <>
              <p className="insp__file" title={project.plan.fileName}>
                {project.plan.fileName}
              </p>
              {project.plan.pageCount > 1 && (
                <label className="field field--wide">
                  <span>Página</span>
                  <span className="field__input">
                    <select value={project.plan.page} data-testid="pagina-pdf" onChange={(e) => void changePlanPage(Number(e.target.value))}>
                      {Array.from({ length: project.plan.pageCount }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1} de {project.plan!.pageCount}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              <label className="range">
                <span>Opacidad del fondo</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={project.planOpacity}
                  data-testid="opacidad"
                  onChange={(e) => patchMeta({ planOpacity: Number(e.target.value) })}
                />
              </label>
              <CalibrationPanel />
              <div className="insp__row">
                <button type="button" className="link" onClick={() => fileInput.current?.click()}>
                  Cambiar plano
                </button>
                <button type="button" className="link" onClick={() => void removePlan()}>
                  Quitar fondo
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="insp__note">Sin plano de fondo: trazas sobre una cuadrícula de 1 m.</p>
              <button type="button" className="link" onClick={() => fileInput.current?.click()}>
                Subir un plano (PDF, PNG o JPG)
              </button>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            data-testid="archivo-plano-panel"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void attachPlanFile(file);
            }}
          />
        </Section>

        <Section title="Selección" testId="seccion-seleccion">
          <SelectionPanel />
        </Section>

        <Section title="Losa" testId="seccion-losa">
          <p className="insp__note">
            {!slab || slab.points.length === 0
              ? 'Define el suelo cerrando un contorno. Es lo que permite generar el volumen.'
              : slab.closed
                ? scaled
                  ? `Contorno cerrado de ${slab.points.length} vértices · ${polygonArea(slab.points).toFixed(1).replace('.', ',')} m².`
                  : `Contorno cerrado de ${slab.points.length} vértices.`
                : `Contorno abierto con ${slab.points.length} puntos.`}
          </p>
          <div className="insp__row">
            <button type="button" className="btn btn--outline btn--small" data-testid="proponer-losa" disabled={project.walls.length < 3 || !scaled} onClick={() => proposeSlab()}>
              Proponer desde los muros
            </button>
            <button type="button" className="btn btn--outline btn--small" data-testid="trazar-losa" disabled={!scaled} onClick={() => setTool('slab')}>
              Trazar a mano
            </button>
          </div>
        </Section>

        <Section title="Comprobación" testId="seccion-comprobacion">
          {errors.length === 0 && warnings.length === 0 && <p className="insp__ok">Todo listo: el modelo se puede generar y recorrer a pie.</p>}
          <ul className="issues">
            {errors.map((i, k) => (
              <li key={`e${k}`} className="issues__item issues__item--error" data-testid={`problema-${i.code}`}>
                <span>{i.message}</span>
                <button type="button" className="link" onClick={() => fixIssue(i)}>
                  Corregir
                </button>
              </li>
            ))}
            {warnings.map((i, k) => (
              <li key={`w${k}`} className="issues__item issues__item--warn" data-testid={`aviso-${i.code}`}>
                <span>{i.message}</span>
                <button type="button" className="link" onClick={() => fixIssue(i)}>
                  Corregir
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--dark insp__generate" data-testid="generar-3d" disabled={!validation.canGenerate} onClick={onGenerate}>
            Generar 3D
          </button>
          <p className="insp__note">
            {validation.canGenerate
              ? validation.canWalk
                ? 'Verás el exterior, la maqueta sin cubierta y podrás entrar a pie.'
                : 'Podrás ver el exterior y la maqueta. Para entrar a pie falta una estancia con un punto de cámara válido.'
              : 'Corrige los puntos marcados para poder levantar el modelo.'}
          </p>
        </Section>
      </aside>
    </div>
  );
}
