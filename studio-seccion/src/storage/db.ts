/**
 * Persistencia local en IndexedDB. Cada proyecto guarda su JSON y, aparte, el
 * archivo original del plano. Nada sale del navegador: no hay red ni telemetría.
 */
import { migrateProject } from '../model/project';
import type { Project } from '../model/types';

const DB_NAME = 'studio-seccion';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const FILES = 'files';

export interface StoredFile {
  projectId: string;
  name: string;
  mime: string;
  /** Se guarda como ArrayBuffer: es el formato binario mejor soportado por IndexedDB. */
  data: ArrayBuffer;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  walls: number;
  rooms: number;
  hasPlan: boolean;
  isModel: boolean;
  /** Segmentos de muro para la miniatura. */
  outline: { ax: number; ay: number; bx: number; by: number }[];
}

/** Error con un mensaje pensado para mostrarse tal cual al usuario. */
export class StorageError extends Error {
  readonly code: 'no-disponible' | 'cuota' | 'no-encontrado' | 'danado' | 'desconocido';
  constructor(code: StorageError['code'], message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError') {
    return new StorageError(
      'cuota',
      'No queda espacio de almacenamiento en este navegador. Elimina algún proyecto o libera espacio y vuelve a guardar.',
    );
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') {
    return new StorageError(
      'no-disponible',
      'El navegador no permite guardar datos locales (puede ocurrir en modo privado). El proyecto sigue abierto, pero no se conservará.',
    );
  }
  return new StorageError('desconocido', `No se pudo acceder al almacenamiento local (${name || 'error desconocido'}).`);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('no-disponible', 'Este navegador no ofrece almacenamiento local (IndexedDB).'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(toStorageError(e));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'projectId' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(toStorageError(req.error));
    req.onblocked = () =>
      reject(new StorageError('no-disponible', 'Hay otra pestaña de Studio Sección bloqueando el almacenamiento. Ciérrala y recarga.'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction;
    try {
      t = db.transaction(stores, mode);
    } catch (e) {
      reject(toStorageError(e));
      return;
    }
    let result: T;
    let req: IDBRequest<T> | void;
    try {
      req = run(t);
    } catch (e) {
      reject(toStorageError(e));
      return;
    }
    if (req) req.onsuccess = () => (result = (req as IDBRequest<T>).result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(toStorageError(t.error));
    t.onabort = () => reject(toStorageError(t.error));
  });
}

export async function saveProject(project: Project): Promise<void> {
  // JSON de ida y vuelta: garantiza que solo se guardan datos serializables.
  const plain = JSON.parse(JSON.stringify(project)) as Project;
  await tx([PROJECTS], 'readwrite', (t) => t.objectStore(PROJECTS).put(plain));
}

export async function loadProject(id: string): Promise<Project> {
  const raw = await tx<unknown>([PROJECTS], 'readonly', (t) => t.objectStore(PROJECTS).get(id));
  if (!raw) throw new StorageError('no-encontrado', 'Ese proyecto no existe en este navegador. Puede haberse eliminado.');
  try {
    return migrateProject(raw);
  } catch (e) {
    throw new StorageError('danado', (e as Error).message);
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<unknown[]>([PROJECTS], 'readonly', (t) => t.objectStore(PROJECTS).getAll());
  const out: ProjectSummary[] = [];
  for (const raw of all ?? []) {
    try {
      const p = migrateProject(raw);
      out.push({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        walls: p.walls.length,
        rooms: p.rooms.length,
        hasPlan: !!p.plan,
        isModel: !!p.model,
        outline: p.walls.map((w) => ({ ax: w.a.x, ay: w.a.y, bx: w.b.x, by: w.b.y })),
      });
    } catch {
      // Un registro ilegible no debe impedir listar los demás.
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Elimina el proyecto y su plano. */
export async function deleteProject(id: string): Promise<void> {
  await tx([PROJECTS, FILES], 'readwrite', (t) => {
    t.objectStore(PROJECTS).delete(id);
    t.objectStore(FILES).delete(id);
  });
}

export async function savePlanFile(file: StoredFile): Promise<void> {
  await tx([FILES], 'readwrite', (t) => t.objectStore(FILES).put(file));
}

export async function loadPlanFile(projectId: string): Promise<StoredFile | null> {
  const f = await tx<StoredFile | undefined>([FILES], 'readonly', (t) => t.objectStore(FILES).get(projectId));
  return f ?? null;
}

export async function deletePlanFile(projectId: string): Promise<void> {
  await tx([FILES], 'readwrite', (t) => t.objectStore(FILES).delete(projectId));
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || est.quota === undefined) return null;
    return { usage: est.usage ?? 0, quota: est.quota };
  } catch {
    return null;
  }
}

/** Solo para pruebas: cierra y olvida la conexión. */
export async function resetConnectionForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
