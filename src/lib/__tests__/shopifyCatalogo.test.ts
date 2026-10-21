import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  construirUrlCatalogo,
  normalizarDominio,
  parsearCatalogo,
} from "@/lib/providers/shopifyCatalogo";

/**
 * Pruebas del catálogo público de Shopify con el JSON real de `/products.json`
 * (fixture con la misma forma que devuelve la tienda, incluidos campos que no
 * usamos: `body_html`, `options`, `tags`…).
 */

const fixture = (): unknown =>
  JSON.parse(readFileSync(path.join(process.cwd(), "prisma", "fixtures", "shopify-productos-v1.json"), "utf8"));

describe("normalizarDominio", () => {
  it("acepta lo que escribe una persona", () => {
    expect(normalizarDominio("mitienda.com")).toBe("mitienda.com");
    expect(normalizarDominio("https://mitienda.com/collections/all")).toBe("mitienda.com");
    expect(normalizarDominio("  WWW.MiTienda.COM/ ")).toBe("mitienda.com");
  });

  it("rechaza lo que no es un dominio", () => {
    expect(normalizarDominio("")).toBeNull();
    expect(normalizarDominio("sin punto")).toBeNull();
    expect(normalizarDominio("javascript:alert(1)")).toBeNull();
    expect(normalizarDominio("https://")).toBeNull();
  });
});

describe("construirUrlCatalogo", () => {
  it("usa el endpoint público con paginación", () => {
    expect(construirUrlCatalogo("mitienda.com")).toBe("https://mitienda.com/products.json?limit=250&page=1");
    expect(construirUrlCatalogo("mitienda.com", 2, 100)).toBe("https://mitienda.com/products.json?limit=100&page=2");
  });

  it("lanza con un dominio inválido", () => {
    expect(() => construirUrlCatalogo("no vale")).toThrow();
  });
});

describe("parsearCatalogo", () => {
  it("lee todos los productos del JSON real", () => {
    const { productos, motivo } = parsearCatalogo(fixture(), "nordika-living.demo");
    expect(motivo).toBeNull();
    expect(productos).toHaveLength(8);
  });

  it("convierte el precio de texto a número", () => {
    const { productos } = parsearCatalogo(fixture(), "nordika-living.demo");
    const mascara = productos.find((producto) => producto.handle === "mascara-led-terapia-facial");
    expect(mascara?.precio).toBe(39.9);
    expect(mascara?.precioComparativo).toBe(59.9);
  });

  it("no inventa un precio «antes» si no es una oferta", () => {
    const { productos } = parsearCatalogo(fixture(), "nordika-living.demo");
    const pistola = productos.find((producto) => producto.handle === "pistola-masaje-percusivo");
    expect(pistola?.precioComparativo).toBeNull();
  });

  it("construye la URL del producto y normaliza fechas", () => {
    const { productos } = parsearCatalogo(fixture(), "nordika-living.demo");
    const primero = productos[0];
    expect(primero.url).toBe("https://nordika-living.demo/products/mascara-led-terapia-facial");
    expect(primero.creadoEn).toMatch(/^2026-01-14T/);
    expect(primero.imagen).toContain("cdn.shopify.com");
  });

  it("lee la disponibilidad real de la variante", () => {
    const { productos } = parsearCatalogo(fixture(), "nordika-living.demo");
    expect(productos.every((producto) => producto.disponible)).toBe(true);

    const agotado = (fixture() as { products: Array<{ variants: Array<{ available: boolean }> }> });
    agotado.products[0].variants[0].available = false;
    const { productos: conAgotado } = parsearCatalogo(agotado, "nordika-living.demo");
    expect(conAgotado[0].disponible).toBe(false);
  });

  it("descarta productos sin precio o sin título (no inventa ceros)", () => {
    const datos = {
      products: [
        { id: 1, title: "Sin precio", handle: "sin-precio", variants: [{ price: "0.00" }] },
        { id: 2, title: "", handle: "sin-titulo", variants: [{ price: "10.00" }] },
        { id: 3, title: "Precio roto", handle: "roto", variants: [{ price: "abc" }] },
        { id: 4, title: "Válido", handle: "valido", variants: [{ price: "12,50" }] },
      ],
    };
    const { productos } = parsearCatalogo(datos, "tienda.com");
    expect(productos).toHaveLength(1);
    expect(productos[0].titulo).toBe("Válido");
    expect(productos[0].precio).toBe(12.5);
  });

  it("deduplica el mismo handle repetido", () => {
    const datos = {
      products: [
        { id: 1, title: "Producto", handle: "producto", variants: [{ price: "10.00" }] },
        { id: 2, title: "Producto repetido", handle: "producto", variants: [{ price: "11.00" }] },
      ],
    };
    expect(parsearCatalogo(datos, "tienda.com").productos).toHaveLength(1);
  });

  it("marca «formato» cuando el JSON no tiene la forma esperada", () => {
    expect(parsearCatalogo({ items: [] }, "tienda.com").motivo).toBe("formato");
    expect(parsearCatalogo(null, "tienda.com").motivo).toBe("formato");
    expect(parsearCatalogo("<html></html>", "tienda.com").motivo).toBe("formato");
  });
});
