/**
 * Control de cámara del visor. Es una clase sin React: el lienzo la llama en
 * cada fotograma y la interfaz le envía órdenes. Devuelve si necesita otro
 * fotograma, de modo que la escena solo se dibuja mientras algo se mueve.
 */
import { MathUtils, Spherical, Vector3, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULTS, type Vec2 } from '../model/types';
import { isFree, moveWithCollisions, nearestFreePoint } from '../generate/collision';
import { floorHeightAt, type SceneDef } from './sceneDef';
import { poseAt, smootherstep, type Pose } from './tour';
import { prefersReducedMotion, showToast, useViewer, type Mode } from './store';

const DWELL_SECONDS = 2.4;
const WALK_SPEED = 1.7;
const RUN_SPEED = 3.1;
const TURN_SPEED = 1.9;
const ORBIT_MODES: Mode[] = ['orbita', 'maqueta', 'obra'];

interface Fly {
  center: Vector3;
  from: Spherical;
  to: Spherical;
  fromLook: Vector3;
  toLook: Vector3;
  t: number;
  seconds: number;
  done?: () => void;
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export class ViewerController {
  readonly def: SceneDef;
  private camera: PerspectiveCamera | null = null;
  private dom: HTMLElement | null = null;
  private orbit: OrbitControls | null = null;
  private invalidate: () => void = () => {};
  private reduced = prefersReducedMotion();
  private disposers: (() => void)[] = [];

  // Visita guiada
  private s = 0;
  private target = 0;
  private rate = 0;
  private dwell = 0;
  private hold = false;
  private cutting = false;
  private wheelAcc = 0;
  private wheelAt = 0;

  // A pie
  private walk = { x: 0, z: 0, yaw: 0, pitch: 0, floorY: 0 };
  private keys = new Set<string>();
  private joystick = { x: 0, y: 0 };
  private drag: { id: number; x: number; y: number } | null = null;

  private fly: Fly | null = null;
  private look = new Vector3();
  private tmpPos = new Vector3();
  private tmpLook = new Vector3();

  constructor(def: SceneDef) {
    this.def = def;
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  attach(camera: PerspectiveCamera, dom: HTMLElement, invalidate: () => void) {
    this.detach();
    this.camera = camera;
    this.dom = dom;
    this.invalidate = invalidate;

    const orbit = new OrbitControls(camera, dom);
    orbit.enableDamping = !this.reduced;
    orbit.dampingFactor = 0.09;
    orbit.enablePan = false;
    orbit.rotateSpeed = 0.7;
    orbit.zoomSpeed = 0.8;
    orbit.minDistance = Math.max(3, this.def.radius * 0.6);
    orbit.maxDistance = this.def.radius * 6 + 20;
    orbit.maxPolarAngle = Math.PI / 2 - 0.04;
    orbit.enabled = false;
    const onChange = () => this.invalidate();
    orbit.addEventListener('change', onChange);
    this.orbit = orbit;
    this.disposers.push(() => {
      orbit.removeEventListener('change', onChange);
      orbit.dispose();
    });

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(dom, 'pointerdown', this.onPointerDown);
    on(dom, 'pointermove', this.onPointerMove);
    on(dom, 'pointerup', this.onPointerUp);
    on(dom, 'pointercancel', this.onPointerUp);
    on(dom, 'wheel', this.onWheel, { passive: false });
    on(window, 'keydown', this.onKeyDown);
    on(window, 'keyup', this.onKeyUp);
    on(window, 'blur', () => this.keys.clear());
    const onVisibility = () => {
      // Fuera de vista no se anima nada.
      if (document.hidden && useViewer.getState().playing) this.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      this.reduced = mq.matches;
      orbit.enableDamping = !this.reduced;
    };
    mq.addEventListener('change', onMotion);
    this.disposers.push(() => mq.removeEventListener('change', onMotion));

    this.s = this.target = 0;
    this.applyTourPose();
    camera.fov = this.targetFov();
    camera.updateProjectionMatrix();
    useViewer.setState({ mode: 'guia', stop: 0, moving: false, playing: false, ready: true });
    this.invalidate();
  }

  detach() {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.camera = null;
    this.dom = null;
    this.orbit = null;
    this.fly = null;
    this.keys.clear();
  }

  // -------------------------------------------------------------------------
  // Fotograma
  // -------------------------------------------------------------------------

  /** Avanza el estado. Devuelve true si hay que dibujar otro fotograma. */
  update(rawDt: number): boolean {
    const camera = this.camera;
    if (!camera) return false;
    const dt = Math.min(rawDt, 0.1);
    const mode = useViewer.getState().mode;
    let active = false;

    if (this.fly) {
      active = true;
      this.stepFly(dt);
    } else if (mode === 'guia') {
      active = this.updateTour(dt);
    } else if (mode === 'caminar') {
      active = this.updateWalk(dt);
    } else if (this.orbit?.enabled) {
      active = this.orbit.update();
      this.look.copy(this.orbit.target);
    }

    const fov = this.targetFov();
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = this.reduced ? fov : MathUtils.damp(camera.fov, fov, 5, dt);
      camera.updateProjectionMatrix();
      active = true;
    }
    return active;
  }

  private targetFov(): number {
    const camera = this.camera!;
    const mode = useViewer.getState().mode;
    let fov: number;
    if (mode === 'caminar') fov = 66;
    else if (mode === 'guia') {
      // Angular a pie, teleobjetivo suave desde fuera.
      fov = MathUtils.clamp(MathUtils.mapLinear(camera.position.y, 1.7, 3.2, 64, 40), 40, 64);
    } else fov = 40;
    if (camera.aspect < 1) fov = Math.min(84, fov * (1 + (1 - camera.aspect) * 0.6));
    return fov;
  }

  private setPose(pos: Vector3, look: Vector3) {
    const camera = this.camera!;
    camera.position.copy(pos);
    this.look.copy(look);
    camera.lookAt(look);
  }

  // -------------------------------------------------------------------------
  // Visita guiada
  // -------------------------------------------------------------------------

  private applyTourPose() {
    poseAt(this.def.tour, this.s, this.tmpPos, this.tmpLook);
    this.setPose(this.tmpPos, this.tmpLook);
  }

  private syncTour(moving: boolean) {
    const stop = Math.round(this.s);
    const st = useViewer.getState();
    if (st.stop !== stop || st.moving !== moving) useViewer.setState({ stop, moving });
  }

  private updateTour(dt: number): boolean {
    if (this.cutting) return false;
    const { tour } = this.def;
    const last = tour.stops.length - 1;
    const playing = useViewer.getState().playing;

    if (Math.abs(this.s - this.target) > 1e-5) {
      const dir = Math.sign(this.target - this.s);
      const legIndex = dir > 0 ? Math.floor(this.s + 1e-6) : Math.ceil(this.s - 1e-6) - 1;
      const leg = tour.legs[legIndex];
      const boundary = dir > 0 ? legIndex + 1 : legIndex;
      if (!leg || leg.kind === 'cut' || this.reduced) {
        // Sin camino comprobado (o con movimiento reducido): fundido, no desplazamiento.
        this.cut(() => {
          this.s = boundary;
          this.applyTourPose();
          this.syncTour(false);
        });
        return false;
      }
      this.rate = MathUtils.damp(this.rate, this.hold ? 0 : 1, 7, dt);
      const limit = dir > 0 ? Math.min(boundary, this.target) : Math.max(boundary, this.target);
      let next = this.s + dir * (dt / leg.seconds) * this.rate;
      if ((dir > 0 && next >= limit) || (dir < 0 && next <= limit)) next = limit;
      this.s = next;
      this.dwell = 0;
      this.applyTourPose();
      const stillMoving = Math.abs(this.s - this.target) > 1e-5;
      this.syncTour(stillMoving && !this.hold);
      return !(this.hold && this.rate < 0.01);
    }

    this.rate = 0;
    this.syncTour(false);
    if (!playing) return false;
    this.dwell += dt;
    if (this.dwell >= DWELL_SECONDS) {
      this.dwell = 0;
      if (this.target < last) this.target += 1;
      else useViewer.setState({ playing: false });
    }
    return true;
  }

  next() {
    if (useViewer.getState().mode !== 'guia') return;
    const last = this.def.tour.stops.length - 1;
    const forward = this.target > this.s + 1e-5;
    const base = forward && !this.hold ? this.target : Math.floor(this.s + 1e-4);
    this.target = Math.min(last, base + 1);
    this.hold = false;
    useViewer.setState({ playing: false });
    this.invalidate();
  }

  prev() {
    if (useViewer.getState().mode !== 'guia') return;
    const backward = this.target < this.s - 1e-5;
    const base = backward && !this.hold ? this.target : Math.ceil(this.s - 1e-4);
    this.target = Math.max(0, base - 1);
    this.hold = false;
    useViewer.setState({ playing: false });
    this.invalidate();
  }

  goToStop(index: number) {
    const last = this.def.tour.stops.length - 1;
    const i = MathUtils.clamp(index, 0, last);
    if (useViewer.getState().mode !== 'guia') {
      this.s = this.target = i;
      this.setMode('guia', true);
      return;
    }
    this.hold = false;
    useViewer.setState({ playing: false });
    if (Math.abs(i - this.s) > 1.01) {
      // Salto entre capítulos no contiguos: corte con fundido.
      this.cut(() => {
        this.s = this.target = i;
        this.applyTourPose();
        this.syncTour(false);
      });
    } else {
      this.target = i;
      this.invalidate();
    }
  }

  play() {
    if (useViewer.getState().mode !== 'guia') return;
    const last = this.def.tour.stops.length - 1;
    this.hold = false;
    this.dwell = 0;
    if (this.s >= last - 1e-5 && this.target === last) {
      this.cut(() => {
        this.s = this.target = 0;
        this.applyTourPose();
        this.syncTour(false);
        this.dwell = DWELL_SECONDS * 0.6;
        useViewer.setState({ playing: true });
      });
      return;
    }
    if (Math.abs(this.s - this.target) < 1e-5) this.target = Math.min(last, this.target + 1);
    useViewer.setState({ playing: true });
    this.invalidate();
  }

  pause() {
    this.hold = Math.abs(this.s - this.target) > 1e-5;
    useViewer.setState({ playing: false, moving: false });
    this.invalidate();
  }

  togglePlay() {
    const st = useViewer.getState();
    if (st.playing || st.moving) this.pause();
    else this.play();
  }

  // -------------------------------------------------------------------------
  // Cambios de modo
  // -------------------------------------------------------------------------

  private onFoot(): boolean {
    const camera = this.camera;
    if (!camera) return false;
    const mode = useViewer.getState().mode;
    if (mode === 'caminar') return true;
    if (mode !== 'guia') return false;
    return camera.position.y < 2.4;
  }

  private poseVectors(pose: Pose): [Vector3, Vector3] {
    return [new Vector3(...pose.pos), new Vector3(...pose.look)];
  }

  /**
   * Lleva la cámara a un encuadre exterior. Si hay un interior de por medio (o
   * movimiento reducido) se hace con fundido; si no, con un vuelo en arco
   * alrededor del edificio, que nunca lo atraviesa.
   */
  private toExterior(mode: Mode, pose: Pose, viaCut: boolean, after?: () => void) {
    const [pos, look] = this.poseVectors(pose);
    const settle = () => {
      this.setPose(pos, look);
      this.enableOrbit(look);
      after?.();
    };
    if (viaCut || this.reduced) {
      this.cut(() => {
        useViewer.setState({ mode, playing: false, moving: false });
        if (mode === 'guia') {
          this.setPose(pos, look);
          after?.();
        } else settle();
      });
      return;
    }
    if (this.orbit) this.orbit.enabled = false;
    useViewer.setState({ mode, playing: false, moving: false });
    this.startFly(pos, look, 1.1, mode === 'guia' ? after : settle);
  }

  private enableOrbit(target: Vector3) {
    const orbit = this.orbit;
    if (!orbit) return;
    const mode = useViewer.getState().mode;
    orbit.target.copy(target);
    orbit.maxPolarAngle = Math.PI / 2 - 0.04;
    orbit.enabled = ORBIT_MODES.includes(mode);
    orbit.update();
    this.invalidate();
  }

  setMode(mode: Mode, force = false) {
    const current = useViewer.getState().mode;
    if (!this.camera || this.cutting) return;
    if (current === mode && !force) return;
    const fromFoot = this.onFoot();
    this.keys.clear();
    this.hold = false;
    this.fly = null;
    if (this.orbit) this.orbit.enabled = false;

    if (mode === 'guia') {
      const last = this.def.tour.stops.length - 1;
      const i = MathUtils.clamp(Math.round(this.s), 0, last);
      const stop = this.def.tour.stops[i];
      const done = () => {
        this.s = this.target = i;
        this.applyTourPose();
        this.syncTour(false);
      };
      if (fromFoot || stop.onFoot) {
        this.cut(() => {
          useViewer.setState({ mode: 'guia', playing: false });
          done();
        });
      } else this.toExterior('guia', stop.pose, false, done);
      return;
    }
    if (mode === 'caminar') {
      const entry = this.def.entryPoints[0];
      if (!entry) {
        showToast('Este proyecto no tiene un punto interior válido. Marca una estancia en el plano.');
        this.setMode(current === 'caminar' ? 'orbita' : current, true);
        return;
      }
      this.enterAt(entry.id);
      return;
    }
    if (mode === 'orbita') {
      this.toExterior('orbita', this.def.homePose, fromFoot);
      return;
    }
    if (mode === 'maqueta') {
      this.toExterior('maqueta', this.def.maquetaPose, fromFoot);
      return;
    }
    if (mode === 'obra') {
      const stage = useViewer.getState().stage;
      this.toExterior('obra', this.def.stages[stage].pose, fromFoot);
    }
  }

  /** Pasa de la guía a explorar libremente SIN mover la cámara de donde está. */
  release() {
    const camera = this.camera;
    if (!camera || this.cutting || useViewer.getState().mode !== 'guia') return;
    this.hold = false;
    if (this.onFoot()) {
      const dir = this.look.clone().sub(camera.position).normalize();
      const p = { x: camera.position.x, y: camera.position.z };
      const safe = isFree(p, this.def.world, 0.16) ? p : nearestFreePoint(p, this.def.world, DEFAULTS.bodyRadius) ?? p;
      this.walk = {
        x: safe.x,
        z: safe.y,
        yaw: Math.atan2(dir.x, dir.z),
        pitch: Math.asin(MathUtils.clamp(dir.y, -1, 1)),
        floorY: camera.position.y - DEFAULTS.eyeHeight,
      };
      useViewer.setState({ mode: 'caminar', playing: false, moving: false });
      showToast('Modo libre · arrastra para mirar y camina con WASD, las flechas o el mando.');
    } else {
      useViewer.setState({ mode: 'orbita', playing: false, moving: false });
      const pos = camera.position.clone();
      this.startFly(pos, new Vector3(...this.def.center), 0.6, () => this.enableOrbit(new Vector3(...this.def.center)));
      showToast('Modo libre · arrastra para orbitar y usa la rueda o el pellizco para acercarte.');
    }
    this.invalidate();
  }

  /** Entra a pie por un punto de entrada seguro. */
  enterAt(entryId: string) {
    const entry = this.def.entryPoints.find((e) => e.id === entryId);
    if (!entry || !this.camera || this.cutting) return;
    if (this.orbit) this.orbit.enabled = false;
    this.fly = null;
    this.cut(() => {
      const safe = nearestFreePoint(entry.point, this.def.world, DEFAULTS.bodyRadius) ?? entry.point;
      this.walk = {
        x: safe.x,
        z: safe.y,
        yaw: entry.yaw,
        pitch: -0.04,
        floorY: floorHeightAt(this.def, safe),
      };
      useViewer.setState({ mode: 'caminar', playing: false, moving: false });
      this.applyWalkPose();
      showToast(`${entry.name} · modo libre a pie`);
    });
  }

  setStage(index: number) {
    const i = MathUtils.clamp(index, 0, this.def.stages.length - 1);
    const st = useViewer.getState();
    if (st.stage === i && st.mode === 'obra') return;
    useViewer.setState({ stage: i });
    if (st.mode === 'obra' && !this.cutting) {
      if (this.orbit) this.orbit.enabled = false;
      const [pos, look] = this.poseVectors(this.def.stages[i].pose);
      if (this.reduced) {
        this.setPose(pos, look);
        this.enableOrbit(look);
      } else this.startFly(pos, look, 1.0, () => this.enableOrbit(look));
    }
    this.invalidate();
  }

  reset() {
    const mode = useViewer.getState().mode;
    if (mode === 'guia') this.goToStop(0);
    else if (mode === 'caminar') {
      // Vuelve al punto de entrada seguro más cercano.
      let best = this.def.entryPoints[0];
      for (const e of this.def.entryPoints) {
        const d = Math.hypot(e.point.x - this.walk.x, e.point.y - this.walk.z);
        if (d < Math.hypot(best.point.x - this.walk.x, best.point.y - this.walk.z)) best = e;
      }
      if (best) this.enterAt(best.id);
    } else this.setMode(mode, true);
  }

  // -------------------------------------------------------------------------
  // Transiciones
  // -------------------------------------------------------------------------

  private cut(apply: () => void) {
    if (this.cutting) return;
    this.cutting = true;
    useViewer.setState({ fade: true });
    window.setTimeout(
      () => {
        apply();
        this.invalidate();
        window.setTimeout(() => {
          this.cutting = false;
          useViewer.setState({ fade: false });
          this.invalidate();
        }, 90);
      },
      this.reduced ? 140 : 260,
    );
  }

  private startFly(pos: Vector3, look: Vector3, seconds: number, done?: () => void) {
    const camera = this.camera!;
    const center = new Vector3(...this.def.center);
    const from = new Spherical().setFromVector3(camera.position.clone().sub(center));
    const to = new Spherical().setFromVector3(pos.clone().sub(center));
    // Giro por el lado corto.
    let d = to.theta - from.theta;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    to.theta = from.theta + d;
    this.fly = { center, from, to, fromLook: this.look.clone(), toLook: look.clone(), t: 0, seconds, done };
    this.invalidate();
  }

  private stepFly(dt: number) {
    const fly = this.fly!;
    fly.t = Math.min(1, fly.t + dt / fly.seconds);
    const e = smootherstep(fly.t);
    const sph = new Spherical(
      MathUtils.lerp(fly.from.radius, fly.to.radius, e),
      MathUtils.lerp(fly.from.phi, fly.to.phi, e),
      MathUtils.lerp(fly.from.theta, fly.to.theta, e),
    );
    this.tmpPos.setFromSpherical(sph).add(fly.center);
    this.tmpLook.lerpVectors(fly.fromLook, fly.toLook, e);
    this.setPose(this.tmpPos, this.tmpLook);
    if (fly.t >= 1) {
      this.fly = null;
      fly.done?.();
    }
  }

  // -------------------------------------------------------------------------
  // A pie
  // -------------------------------------------------------------------------

  private applyWalkPose() {
    const w = this.walk;
    const cp = Math.cos(w.pitch);
    this.tmpPos.set(w.x, w.floorY + DEFAULTS.eyeHeight, w.z);
    this.tmpLook.set(w.x + Math.sin(w.yaw) * cp, this.tmpPos.y + Math.sin(w.pitch), w.z + Math.cos(w.yaw) * cp);
    this.setPose(this.tmpPos, this.tmpLook);
  }

  private walkInput() {
    const k = this.keys;
    let forward = 0;
    let strafe = 0;
    let turn = 0;
    if (k.has('w') || k.has('arrowup')) forward += 1;
    if (k.has('s') || k.has('arrowdown')) forward -= 1;
    if (k.has('d')) strafe += 1;
    if (k.has('a')) strafe -= 1;
    if (k.has('arrowleft') || k.has('q')) turn += 1;
    if (k.has('arrowright') || k.has('e')) turn -= 1;
    forward += -this.joystick.y;
    turn += -this.joystick.x * 0.9;
    return { forward, strafe, turn, run: k.has('shift') };
  }

  private stepWalk(dt: number, input: { forward: number; strafe: number; turn: number; run: boolean }): boolean {
    const w = this.walk;
    w.yaw += input.turn * TURN_SPEED * dt;
    let mx = Math.sin(w.yaw) * input.forward - Math.cos(w.yaw) * input.strafe;
    let mz = Math.cos(w.yaw) * input.forward + Math.sin(w.yaw) * input.strafe;
    const mag = Math.hypot(mx, mz);
    let moved = false;
    if (mag > 1e-3) {
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag);
      mx = (mx / mag) * speed * dt;
      mz = (mz / mag) * speed * dt;
      const next = moveWithCollisions({ x: w.x, y: w.z }, { x: mx, y: mz }, this.def.world, DEFAULTS.bodyRadius);
      moved = Math.abs(next.x - w.x) + Math.abs(next.y - w.z) > 1e-6;
      w.x = next.x;
      w.z = next.y;
    }
    const floor = floorHeightAt(this.def, { x: w.x, y: w.z });
    const settling = Math.abs(floor - w.floorY) > 1e-3;
    w.floorY = settling ? MathUtils.damp(w.floorY, floor, 9, dt) : floor;
    return moved || settling || Math.abs(input.turn) > 1e-3 || mag > 1e-3;
  }

  private updateWalk(dt: number): boolean {
    const active = this.stepWalk(dt, this.walkInput());
    this.applyWalkPose();
    return active;
  }

  setJoystick(x: number, y: number) {
    this.joystick.x = x;
    this.joystick.y = y;
    this.invalidate();
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    if (useViewer.getState().mode !== 'caminar' || this.cutting) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.dom?.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const k = e.pointerType === 'touch' ? 0.0052 : 0.0036;
    // Como en una vista de calle: se «agarra» la escena.
    this.walk.yaw += (e.clientX - d.x) * k;
    this.walk.pitch = MathUtils.clamp(this.walk.pitch + (e.clientY - d.y) * k, -1.1, 1.1);
    d.x = e.clientX;
    d.y = e.clientY;
    this.invalidate();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.drag = null;
  };

  private onWheel = (e: WheelEvent) => {
    const mode = useViewer.getState().mode;
    if (mode !== 'guia') return;
    // La rueda avanza capítulos SOLO sobre el visor y en modo presentación.
    e.preventDefault();
    const now = performance.now();
    if (now - this.wheelAt < 700) return;
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) < 50) return;
    if (this.wheelAcc > 0) this.next();
    else this.prev();
    this.wheelAcc = 0;
    this.wheelAt = now;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const st = useViewer.getState();
    if (st.mode === 'caminar') {
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this.keys.add(key);
        if (key.startsWith('arrow')) e.preventDefault();
        this.invalidate();
        return;
      }
    } else if (st.mode === 'guia') {
      if (key === 'arrowright' || key === 'arrowdown' || key === 'pagedown') {
        e.preventDefault();
        this.next();
        return;
      }
      if (key === 'arrowleft' || key === 'arrowup' || key === 'pageup') {
        e.preventDefault();
        this.prev();
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        this.togglePlay();
        return;
      }
    } else if (st.mode === 'obra') {
      if (key === 'arrowright') return this.setStage(st.stage + 1);
      if (key === 'arrowleft') return this.setStage(st.stage - 1);
    }
    if (key === 'g') this.setMode('guia');
    else if (key === 'l') {
      if (st.mode === 'guia') this.release();
      else this.setMode('orbita');
    } else if (key === 'm') this.setMode('maqueta');
    else if (key === 'o') this.setMode('obra');
    else if (key === 'r') this.reset();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  // -------------------------------------------------------------------------
  // Depuración y pruebas de extremo a extremo
  // -------------------------------------------------------------------------

  /** Estado de solo lectura que consultan las pruebas automáticas. */
  debug() {
    const c = this.camera;
    return {
      mode: useViewer.getState().mode,
      s: this.s,
      target: this.target,
      camera: c ? [c.position.x, c.position.y, c.position.z] : null,
      look: [this.look.x, this.look.y, this.look.z],
      walk: { ...this.walk },
      fov: c?.fov ?? 0,
    };
  }

  /**
   * Camina en línea recta con el mismo código que el teclado, a paso fijo.
   * Las pruebas lo usan para comprobar puertas y muros sin depender del reloj.
   */
  simulateWalk(from: Vec2, yaw: number, seconds: number): Vec2 {
    if (useViewer.getState().mode !== 'caminar') return from;
    this.walk.x = from.x;
    this.walk.z = from.y;
    this.walk.yaw = yaw;
    this.walk.pitch = 0;
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      this.stepWalk(dt, { forward: 1, strafe: 0, turn: 0, run: false });
    }
    this.applyWalkPose();
    this.invalidate();
    return { x: this.walk.x, y: this.walk.z };
  }
}
