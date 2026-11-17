import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Opening, Vec2, Wall } from '../model/types';
import {
  boundsOf,
  dist,
  formatMeters,
  leftNormal,
  polygonArea,
  projectOnSegment,
  round,
  wallDir,
  wallLength,
} from '../model/geometry';
import { coincidentEnds, openingSpan } from '../model/project';
import { nearestWall } from '../generate/walls';
import { snapPoint, type SnapResult } from './snap';
import {
  addOpening,
  addRoom,
  addSlabPoint,
  addWall,
  beginGesture,
  closeSlab,
  commit,
  displayMetersPerPixel,
  endGesture,
  isScaled,
  moveSlabPoint,
  moveWallEnd,
  notify,
  select,
  setCalibrationPoint,
  translateWall,
  updateOpening,
  updateRoom,
  useEditor,
} from './store';
import { DEFAULTS } from '../model/types';

interface View {
  zoom: number;
  x: number;
  y: number;
}

type Drag =
  | { kind: 'wall-end'; wallId: string; end: 'a' | 'b'; ignore: string[] }
  | { kind: 'wall-body'; wallId: string; original: Wall; start: Vec2 }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'slab-point'; index: number };

interface Press {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  mode: 'click' | 'pan' | 'drag';
  view: View;
  drag?: Drag;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 900;
const deg = (d: Vec2) => (Math.atan2(d.y, d.x) * 180) / Math.PI;

function wallPolygon(w: Wall): string {
  const d = wallDir(w);
  const n = leftNormal(d);
  const h = w.thickness / 2;
  const pts = [
    [w.a.x + n.x * h, w.a.y + n.y * h],
    [w.b.x + n.x * h, w.b.y + n.y * h],
    [w.b.x - n.x * h, w.b.y - n.y * h],
    [w.a.x - n.x * h, w.a.y - n.y * h],
  ];
  return pts.map((p) => `${p[0]},${p[1]}`).join(' ');
}

export interface PlanCanvasHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
}

export function PlanCanvas({ handle }: { handle: React.RefObject<PlanCanvasHandle | null> }) {
  const project = useEditor((s) => s.project)!;
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const calibration = useEditor((s) => s.calibration);
  const chain = useEditor((s) => s.chain);
  const raster = useEditor((s) => s.raster);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ zoom: 50, x: 40, y: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [hover, setHover] = useState<{ raw: Vec2; snap: SnapResult } | null>(null);
  const press = useRef<Press | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; view: View } | null>(null);

  const mpp = displayMetersPerPixel(project);
  const scaled = isScaled(project);
  const px = 1 / view.zoom; // un píxel de pantalla, en metros

  // --- Vista -----------------------------------------------------------------

  const worldBounds = useCallback(() => {
    if (project.plan) return { minX: 0, minY: 0, maxX: project.plan.width * mpp, maxY: project.plan.height * mpp };
    const pts = [...project.walls.flatMap((w) => [w.a, w.b]), ...(project.slab?.points ?? []), ...project.rooms.map((r) => r.camera)];
    const b = boundsOf(pts);
    if (!b) return { minX: -1, minY: -1, maxX: 15, maxY: 10 };
    return { minX: b.minX - 2, minY: b.minY - 2, maxX: b.maxX + 2, maxY: b.maxY + 2 };
  }, [project.plan, project.walls, project.slab, project.rooms, mpp]);

  const fit = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = worldBounds();
    const bw = Math.max(0.5, b.maxX - b.minX);
    const bh = Math.max(0.5, b.maxY - b.minY);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((r.width - 48) / bw, (r.height - 48) / bh)));
    setView({ zoom, x: (r.width - bw * zoom) / 2 - b.minX * zoom, y: (r.height - bh * zoom) / 2 - b.minY * zoom });
  }, [worldBounds]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    handle.current = { zoomBy: (f) => zoomAt(f, size.w / 2, size.h / 2), fit };
    return () => {
      handle.current = null;
    };
  }, [handle, zoomAt, fit, size]);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Encaje inicial y al cambiar de plano o de página.
  const planKey = `${project.id}|${project.plan?.fileName ?? ''}|${project.plan?.page ?? 0}|${project.plan?.width ?? 0}`;
  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, size.w > 0]);

  // Al (re)calibrar cambia la relación metro/píxel: el dibujo no debe saltar en pantalla.
  // Si lo que cambia es el plano, ya se ha reencajado la vista y no hay que corregir nada.
  const prevScale = useRef({ mpp, planKey });
  useLayoutEffect(() => {
    const prev = prevScale.current;
    if (prev.planKey === planKey && prev.mpp !== mpp) {
      const k = prev.mpp / mpp;
      setView((v) => ({ ...v, zoom: v.zoom * k }));
    }
    prevScale.current = { mpp, planKey };
  }, [mpp, planKey]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);

  useEffect(() => {
    // Gancho de solo lectura para las pruebas automáticas.
    const api = {
      toScreen: (p: Vec2) => {
        const r = svgRef.current!.getBoundingClientRect();
        const v = viewRef.current;
        return { x: r.left + v.x + p.x * v.zoom, y: r.top + v.y + p.y * v.zoom };
      },
      metersPerPixel: () => displayMetersPerPixel(useEditor.getState().project!),
      state: () => useEditor.getState(),
    };
    (window as unknown as { __editor?: unknown }).__editor = api;
    return () => {
      delete (window as unknown as { __editor?: unknown }).__editor;
    };
  }, []);

  // --- Imanes ----------------------------------------------------------------

  const tolerance = 11 * px;
  const snapFor = useCallback(
    (raw: Vec2): SnapResult => {
      const st = useEditor.getState();
      const p = st.project!;
      const tol = 11 / viewRef.current.zoom;
      if (st.tool === 'wall') {
        return snapPoint(raw, {
          walls: p.walls,
          points: st.chain ? [st.chain.start] : [],
          anchor: st.chain?.last ?? null,
          tolerance: tol,
        });
      }
      if (st.tool === 'slab') {
        const open = p.slab && !p.slab.closed ? p.slab.points : [];
        return snapPoint(raw, {
          walls: p.walls.map((w) => ({ ...w })),
          points: open.slice(0, 1),
          anchor: open[open.length - 1] ?? null,
          tolerance: tol,
        });
      }
      return { point: raw, kind: 'libre' };
    },
    [],
  );

  // --- Clic con cada herramienta ----------------------------------------------

  const handleClick = (raw: Vec2) => {
    const st = useEditor.getState();
    const p = st.project!;
    const needsScale = () => {
      notify('error', 'Calibra primero la escala: sin ella no se puede trazar en metros.');
      useEditor.setState({ tool: 'calibrate', calibration: { a: null, b: null } });
    };
    switch (st.tool) {
      case 'select':
        select(null);
        return;
      case 'calibrate':
        if (!p.plan) return;
        setCalibrationPoint({ x: raw.x / mpp, y: raw.y / mpp });
        return;
      case 'wall': {
        if (!scaled) return needsScale();
        const s = snapFor(raw);
        if (!st.chain) {
          useEditor.setState({ chain: { start: s.point, last: s.point } });
          return;
        }
        if (dist(s.point, st.chain.last) < 0.1) {
          useEditor.setState({ chain: null });
          return;
        }
        const closing = dist(s.point, st.chain.start) < 1e-6;
        addWall(st.chain.last, s.point);
        // La cadena termina al cerrar el perímetro o al apoyarse en un muro existente.
        if (closing || s.kind === 'extremo' || s.kind === 'muro') {
          useEditor.setState({ chain: null });
          if (closing) notify('ok', 'Perímetro cerrado. Puedes proponer la losa a partir de los muros.');
        } else useEditor.setState({ chain: { start: st.chain.start, last: s.point } });
        return;
      }
      case 'door':
      case 'window': {
        if (!scaled) return needsScale();
        const hit = nearestWall(p.walls, raw, Math.max(0.25, 14 * px));
        if (!hit) {
          notify('info', `Haz clic sobre un muro para colocar la ${st.tool === 'door' ? 'puerta' : 'ventana'}.`);
          return;
        }
        addOpening(hit.wall.id, st.tool, hit.along);
        return;
      }
      case 'slab': {
        if (!scaled) return needsScale();
        const s = snapFor(raw);
        const open = p.slab && !p.slab.closed ? p.slab.points : null;
        if (open && open.length >= 3 && dist(s.point, open[0]) < tolerance) {
          closeSlab();
          return;
        }
        if (open && dist(s.point, open[open.length - 1]) < 0.05) return;
        if (!open) commit({ slab: { points: [s.point], closed: false, thickness: p.slab?.thickness ?? DEFAULTS.slabThickness } });
        else addSlabPoint(s.point);
        return;
      }
      case 'room':
        if (!scaled) return needsScale();
        addRoom({ x: round(raw.x, 3), y: round(raw.y, 3) });
        return;
      default:
        return;
    }
  };

  // --- Punteros ----------------------------------------------------------------

  const startDrag = (e: ReactPointerEvent, drag: Drag) => {
    if (useEditor.getState().tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, mode: 'drag', view: viewRef.current, drag };
    beginGesture();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, view: viewRef.current };
      if (press.current?.mode === 'drag') endGesture();
      press.current = null;
      return;
    }
    const panning = tool === 'pan' || e.button === 1;
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, mode: panning ? 'pan' : 'click', view: viewRef.current };
  };

  const applyDrag = (drag: Drag, raw: Vec2) => {
    const st = useEditor.getState();
    const p = st.project!;
    const tol = 11 / viewRef.current.zoom;
    if (drag.kind === 'wall-end') {
      const wall = p.walls.find((w) => w.id === drag.wallId);
      if (!wall) return;
      const s = snapPoint(raw, {
        walls: p.walls,
        ignoreWallIds: drag.ignore,
        anchor: drag.end === 'a' ? wall.b : wall.a,
        tolerance: tol,
      });
      moveWallEnd(drag.wallId, drag.end, s.point);
      setHover({ raw, snap: s });
    } else if (drag.kind === 'wall-body') {
      translateWall(drag.wallId, drag.original, { x: round(raw.x - drag.start.x, 3), y: round(raw.y - drag.start.y, 3) });
    } else if (drag.kind === 'opening') {
      const o = p.openings.find((x) => x.id === drag.id);
      const wall = o && p.walls.find((w) => w.id === o.wallId);
      if (o && wall) updateOpening(o.id, { offset: round(projectOnSegment(raw, wall.a, wall.b).along, 3) }, true);
    } else if (drag.kind === 'room') {
      updateRoom(drag.id, { camera: { x: round(raw.x, 3), y: round(raw.y, 3) } });
    } else if (drag.kind === 'slab-point') {
      const s = snapPoint(raw, { walls: p.walls, tolerance: tol });
      moveSlabPoint(drag.index, s.point);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const base = pinch.current;
      const r = svgRef.current!.getBoundingClientRect();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.view.zoom * (d / Math.max(1, base.d))));
      const k = zoom / base.view.zoom;
      const ox = base.cx - r.left;
      const oy = base.cy - r.top;
      setView({ zoom, x: ox - (ox - base.view.x) * k + (cx - base.cx), y: oy - (oy - base.view.y) * k + (cy - base.cy) });
      return;
    }
    const pr = press.current;
    const raw = toWorld(e.clientX, e.clientY);
    if (pr && pr.id === e.pointerId) {
      const dx = e.clientX - pr.x;
      const dy = e.clientY - pr.y;
      if (!pr.moved && Math.hypot(dx, dy) > 4) pr.moved = true;
      if (pr.mode === 'drag' && pr.drag) {
        if (pr.moved) applyDrag(pr.drag, raw);
        return;
      }
      if (pr.moved) {
        // Arrastrar el fondo siempre desplaza la vista, con cualquier herramienta.
        pr.mode = 'pan';
        setView({ ...pr.view, x: pr.view.x + dx, y: pr.view.y + dy });
        return;
      }
    }
    if (tool === 'wall' || tool === 'slab') setHover({ raw, snap: snapFor(raw) });
    else if (tool === 'door' || tool === 'window' || tool === 'calibrate' || tool === 'room') setHover({ raw, snap: { point: raw, kind: 'libre' } });
    else if (hover) setHover(null);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    if (pr.mode === 'drag') {
      endGesture();
      if (hover) setHover(null);
      return;
    }
    if (pr.mode === 'click' && !pr.moved && e.button === 0) handleClick(toWorld(e.clientX, e.clientY));
  };

  const onPointerCancel = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (press.current?.mode === 'drag') endGesture();
    press.current = null;
  };

  // --- Derivados para dibujar ---------------------------------------------------

  const wallsById = useMemo(() => new Map(project.walls.map((w) => [w.id, w])), [project.walls]);
  const selWallId = selection?.type === 'wall' ? selection.id : null;
  const selOpeningId = selection?.type === 'opening' ? selection.id : null;
  const selRoomId = selection?.type === 'room' ? selection.id : null;
  const slab = project.slab;
  const slabSelected = selection?.type === 'slab' || tool === 'slab';
  const interactive = tool === 'select';
  const handleR = 6.5 * px;
  const font = 11.5 * px;

  const previewOpening = useMemo(() => {
    if (!hover || (tool !== 'door' && tool !== 'window') || !scaled) return null;
    const hit = nearestWall(project.walls, hover.raw, Math.max(0.25, 14 * px));
    if (!hit) return null;
    const w = tool === 'door' ? DEFAULTS.door.width : DEFAULTS.window.width;
    return { wall: hit.wall, u0: hit.along - w / 2, width: w };
  }, [hover, tool, scaled, project.walls, px]);

  const renderOpening = (o: Opening) => {
    const wall = wallsById.get(o.wallId);
    if (!wall) return null;
    const [u0, u1] = openingSpan(o);
    const t = wall.thickness;
    const L = wallLength(wall);
    const out = u0 < 0 || u1 > L;
    const selected = o.id === selOpeningId;
    return (
      <g
        key={o.id}
        transform={`translate(${wall.a.x} ${wall.a.y}) rotate(${deg(wallDir(wall))})`}
        className={`pc-opening${selected ? ' is-selected' : ''}${out ? ' is-invalid' : ''}`}
        data-opening-id={o.id}
        data-kind={o.kind}
        onPointerDown={(e) => {
          if (!interactive) return;
          select({ type: 'opening', id: o.id });
          startDrag(e, { kind: 'opening', id: o.id });
        }}
      >
        <rect x={u0} y={-t / 2 - px} width={o.width} height={t + 2 * px} className="pc-opening__gap" />
        {o.kind === 'door' ? (
          <>
            <line x1={u0} y1={t / 2} x2={u0} y2={t / 2 + o.width} className="pc-opening__leaf" />
            <path d={`M ${u1} ${t / 2} A ${o.width} ${o.width} 0 0 1 ${u0} ${t / 2 + o.width}`} className="pc-opening__arc" />
          </>
        ) : (
          <>
            <line x1={u0} y1={-t / 6} x2={u1} y2={-t / 6} className="pc-opening__pane" />
            <line x1={u0} y1={t / 6} x2={u1} y2={t / 6} className="pc-opening__pane" />
          </>
        )}
        <rect x={u0} y={-t / 2 - 4 * px} width={o.width} height={t + 8 * px} className="pc-hit" />
      </g>
    );
  };

  const cal = calibration;
  const calA = cal.a ?? (tool !== 'calibrate' ? project.calibration?.a ?? null : null);
  const calB = cal.b ?? (tool !== 'calibrate' ? project.calibration?.b ?? null : null);

  return (
    <svg
      ref={svgRef}
      className="plan-canvas"
      data-testid="lienzo"
      data-tool={tool}
      role="application"
      aria-label="Lienzo del plano. Usa las herramientas para trazar muros, huecos, losa y estancias."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => hover && setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id="pc-grid" width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" className="pc-grid__line" strokeWidth={px} />
        </pattern>
        <pattern id="pc-grid-5" width={5} height={5} patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" className="pc-grid__line pc-grid__line--major" strokeWidth={1.4 * px} />
        </pattern>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {!project.plan && (
          <>
            <rect x={-500} y={-500} width={1000} height={1000} fill="url(#pc-grid)" />
            <rect x={-500} y={-500} width={1000} height={1000} fill="url(#pc-grid-5)" />
          </>
        )}
        {project.plan && raster && (
          <>
            <rect x={0} y={0} width={project.plan.width * mpp} height={project.plan.height * mpp} className="pc-sheet" />
            <image
              href={raster.url}
              x={0}
              y={0}
              width={project.plan.width * mpp}
              height={project.plan.height * mpp}
              opacity={project.planOpacity}
              preserveAspectRatio="none"
              data-testid="fondo-plano"
            />
          </>
        )}

        {slab && slab.points.length > 0 && (
          <g className={`pc-slab${slab.closed ? ' is-closed' : ''}${slabSelected ? ' is-selected' : ''}`} data-testid="losa">
            {slab.closed ? (
              <polygon
                points={slab.points.map((p) => `${p.x},${p.y}`).join(' ')}
                strokeWidth={1.5 * px}
                onPointerDown={(e) => {
                  if (!interactive) return;
                  // La losa se selecciona, pero el arrastre sigue desplazando la vista.
                  if (e.button === 0) select({ type: 'slab' });
                }}
              />
            ) : (
              <polyline points={slab.points.map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
            )}
          </g>
        )}

        {project.walls.map((w) => (
          <g key={w.id} className={`pc-wall${w.id === selWallId ? ' is-selected' : ''}`} data-wall-id={w.id}>
            <polygon
              points={wallPolygon(w)}
              strokeWidth={px}
              onPointerDown={(e) => {
                if (!interactive) return;
                select({ type: 'wall', id: w.id });
                startDrag(e, { kind: 'wall-body', wallId: w.id, original: w, start: toWorld(e.clientX, e.clientY) });
              }}
            />
            <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="pc-wall__axis" strokeWidth={px} />
          </g>
        ))}

        {project.openings.map(renderOpening)}

        {scaled &&
          project.walls.map((w) => {
            const L = wallLength(w);
            if (L * view.zoom < 46) return null;
            const d = wallDir(w);
            const n = leftNormal(d);
            const off = w.thickness / 2 + 9 * px;
            let angle = deg(d);
            if (angle > 90 || angle <= -90) angle += 180;
            const mx = (w.a.x + w.b.x) / 2 - n.x * off;
            const my = (w.a.y + w.b.y) / 2 - n.y * off;
            return (
              <text
                key={w.id}
                x={mx}
                y={my}
                fontSize={font}
                className={`pc-dim${w.id === selWallId ? ' is-selected' : ''}`}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${angle} ${mx} ${my})`}
                data-dim-for={w.id}
              >
                {formatMeters(L)}
              </text>
            );
          })}

        {slab && slabSelected &&
          slab.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === 0 && !slab.closed ? handleR * 1.3 : handleR * 0.85}
              className={`pc-handle pc-handle--slab${i === 0 && !slab.closed ? ' is-first' : ''}`}
              strokeWidth={1.5 * px}
              onPointerDown={(e) => {
                if (!interactive || !slab.closed) return;
                select({ type: 'slab' });
                startDrag(e, { kind: 'slab-point', index: i });
              }}
            />
          ))}

        {project.rooms.map((r) => (
          <g
            key={r.id}
            className={`pc-room${r.id === selRoomId ? ' is-selected' : ''}`}
            data-room-id={r.id}
            onPointerDown={(e) => {
              if (!interactive) return;
              select({ type: 'room', id: r.id });
              startDrag(e, { kind: 'room', id: r.id });
            }}
          >
            <circle cx={r.camera.x} cy={r.camera.y} r={DEFAULTS.bodyRadius} className="pc-room__body" strokeWidth={px} />
            <circle cx={r.camera.x} cy={r.camera.y} r={5 * px} className="pc-room__dot" />
            <text x={r.camera.x} y={r.camera.y - 12 * px - DEFAULTS.bodyRadius * 0.4} fontSize={font * 1.08} textAnchor="middle" className="pc-room__name">
              {r.name}
            </text>
            <circle cx={r.camera.x} cy={r.camera.y} r={14 * px} className="pc-hit" />
          </g>
        ))}

        {selWallId &&
          interactive &&
          (() => {
            const w = wallsById.get(selWallId);
            if (!w) return null;
            return (['a', 'b'] as const).map((end) => (
              <circle
                key={end}
                cx={w[end].x}
                cy={w[end].y}
                r={handleR}
                className="pc-handle"
                strokeWidth={1.5 * px}
                data-handle={end}
                onPointerDown={(e) => {
                  const joined = coincidentEnds(project.walls, w[end]).map((j) => j.wallId);
                  startDrag(e, { kind: 'wall-end', wallId: w.id, end, ignore: [...new Set([w.id, ...joined])] });
                }}
              />
            ));
          })()}

        {tool === 'wall' && chain && hover && (
          <g className="pc-preview">
            <line x1={chain.last.x} y1={chain.last.y} x2={hover.snap.point.x} y2={hover.snap.point.y} strokeWidth={2 * px} />
            {scaled && dist(chain.last, hover.snap.point) > 0.05 && (
              <text
                x={(chain.last.x + hover.snap.point.x) / 2}
                y={(chain.last.y + hover.snap.point.y) / 2 - 10 * px}
                fontSize={font * 1.1}
                textAnchor="middle"
                className="pc-preview__label"
              >
                {formatMeters(dist(chain.last, hover.snap.point))}
              </text>
            )}
          </g>
        )}
        {tool === 'slab' && slab && !slab.closed && slab.points.length > 0 && hover && (
          <g className="pc-preview pc-preview--slab">
            <line
              x1={slab.points[slab.points.length - 1].x}
              y1={slab.points[slab.points.length - 1].y}
              x2={hover.snap.point.x}
              y2={hover.snap.point.y}
              strokeWidth={1.5 * px}
              strokeDasharray={`${6 * px} ${4 * px}`}
            />
          </g>
        )}
        {(tool === 'wall' || tool === 'slab') && hover && hover.snap.kind !== 'libre' && (
          <rect
            x={hover.snap.point.x - 5 * px}
            y={hover.snap.point.y - 5 * px}
            width={10 * px}
            height={10 * px}
            className={`pc-snap pc-snap--${hover.snap.kind}`}
            strokeWidth={1.5 * px}
          />
        )}
        {tool === 'wall' && chain && <circle cx={chain.start.x} cy={chain.start.y} r={handleR} className="pc-handle is-first" strokeWidth={1.5 * px} />}

        {previewOpening && (
          <g transform={`translate(${previewOpening.wall.a.x} ${previewOpening.wall.a.y}) rotate(${deg(wallDir(previewOpening.wall))})`} className="pc-preview">
            <rect
              x={previewOpening.u0}
              y={-previewOpening.wall.thickness / 2 - 2 * px}
              width={previewOpening.width}
              height={previewOpening.wall.thickness + 4 * px}
              className="pc-preview__opening"
              strokeWidth={1.5 * px}
            />
          </g>
        )}

        {tool === 'calibrate' && (
          <g className="pc-cal">
            {calA && calB && <line x1={calA.x * mpp} y1={calA.y * mpp} x2={calB.x * mpp} y2={calB.y * mpp} strokeWidth={2 * px} />}
            {calA && !calB && hover && <line x1={calA.x * mpp} y1={calA.y * mpp} x2={hover.raw.x} y2={hover.raw.y} strokeWidth={1.5 * px} strokeDasharray={`${5 * px} ${4 * px}`} />}
            {[calA, calB].map(
              (p, i) =>
                p && (
                  <g key={i} data-testid={`cal-${i === 0 ? 'a' : 'b'}`}>
                    <circle cx={p.x * mpp} cy={p.y * mpp} r={7 * px} strokeWidth={1.5 * px} />
                    <line x1={p.x * mpp - 11 * px} y1={p.y * mpp} x2={p.x * mpp + 11 * px} y2={p.y * mpp} strokeWidth={px} />
                    <line x1={p.x * mpp} y1={p.y * mpp - 11 * px} x2={p.x * mpp} y2={p.y * mpp + 11 * px} strokeWidth={px} />
                  </g>
                ),
            )}
          </g>
        )}
      </g>
      {slab?.closed && scaled && (
        <text x={12} y={size.h - 14} className="pc-status">
          Losa · {polygonArea(slab.points).toFixed(1).replace('.', ',')} m²
        </text>
      )}
    </svg>
  );
}
