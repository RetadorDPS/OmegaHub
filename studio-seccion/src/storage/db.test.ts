import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createProject, makeOpening, makeWall } from '../model/project';
import {
  deleteProject,
  listProjects,
  loadPlanFile,
  loadProject,
  resetConnectionForTests,
  saveProject,
  savePlanFile,
  StorageError,
} from './db';

beforeEach(async () => {
  await resetConnectionForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('persistencia local', () => {
  it('guarda, reabre y conserva la geometría', async () => {
    const p = createProject('Casa en L');
    const w = makeWall({ x: 0, y: 0 }, { x: 4, y: 0 });
    p.walls = [w];
    p.openings = [makeOpening(w.id, 'door', 1.5)];
    await saveProject(p);

    const again = await loadProject(p.id);
    expect(again.walls[0].b.x).toBe(4);
    expect(again.openings[0].offset).toBe(1.5);

    again.openings[0].offset = 2.5;
    await saveProject(again);
    expect((await loadProject(p.id)).openings[0].offset).toBe(2.5);
  });

  it('mantiene los proyectos y sus planos separados', async () => {
    const a = createProject('A');
    const b = createProject('B');
    await saveProject(a);
    await saveProject(b);
    await savePlanFile({ projectId: a.id, name: 'a.png', mime: 'image/png', data: new Uint8Array([1, 2, 3]).buffer });
    expect((await listProjects()).map((x) => x.name).sort()).toEqual(['A', 'B']);
    expect(await loadPlanFile(b.id)).toBeNull();
    expect(new Uint8Array((await loadPlanFile(a.id))!.data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('elimina el proyecto junto con su plano', async () => {
    const a = createProject('A');
    await saveProject(a);
    await savePlanFile({ projectId: a.id, name: 'a.png', mime: 'image/png', data: new ArrayBuffer(4) });
    await deleteProject(a.id);
    expect(await listProjects()).toEqual([]);
    expect(await loadPlanFile(a.id)).toBeNull();
    await expect(loadProject(a.id)).rejects.toBeInstanceOf(StorageError);
  });
});
