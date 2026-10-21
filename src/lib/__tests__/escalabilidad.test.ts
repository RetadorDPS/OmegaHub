import { describe, expect, it } from "vitest";
import { conCache } from "@/lib/cache";
import { permitido } from "@/lib/limite";

describe("caché en memoria", () => {
  it("cachea el valor durante el TTL", async () => {
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      return `dato-${llamadas}`;
    };

    const primero = await conCache("k1", 60_000, cargar);
    const segundo = await conCache("k1", 60_000, cargar);

    expect(primero).toBe("dato-1");
    expect(segundo).toBe("dato-1"); // servido de caché
    expect(llamadas).toBe(1);
  });

  it("expira y vuelve a cargar", async () => {
    let llamadas = 0;
    const cargar = async () => {
      llamadas += 1;
      return llamadas;
    };

    await conCache("k2", 1, cargar); // TTL de 1 ms
    await new Promise((r) => setTimeout(r, 10));
    const valor = await conCache("k2", 60_000, cargar);

    expect(valor).toBe(2);
  });
});

describe("límite de ritmo", () => {
  it("permite hasta el máximo y bloquea el exceso", () => {
    const clave = `test:${Date.now()}`;
    const decisiones = Array.from({ length: 5 }, () => permitido(clave, 3, 60_000));

    expect(decisiones.slice(0, 3)).toEqual([true, true, true]);
    expect(decisiones.slice(3)).toEqual([false, false]);
  });

  it("aísla por clave (usuario + acción)", () => {
    const base = `test-aislamiento:${Date.now()}`;
    expect(permitido(`${base}:a`, 1, 60_000)).toBe(true);
    expect(permitido(`${base}:a`, 1, 60_000)).toBe(false);
    expect(permitido(`${base}:b`, 1, 60_000)).toBe(true); // otra acción, libre
  });

  it("reabre la ventana cuando caduca", async () => {
    const clave = `test-ventana:${Date.now()}`;
    expect(permitido(clave, 1, 20)).toBe(true);
    expect(permitido(clave, 1, 20)).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(permitido(clave, 1, 20)).toBe(true);
  });
});
