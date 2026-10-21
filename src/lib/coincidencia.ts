/**
 * ============================================================================
 *  COINCIDENCIA DE TÍTULOS
 * ============================================================================
 *  Para saber cuántas tiendas reales venden el mismo producto hay que
 *  emparejar títulos escritos de mil maneras:
 *
 *    «Mascarilla LED facial 7 colores»  ≈  «Máscara LED de terapia facial»
 *
 *  Reglas (deterministas y probadas):
 *    · sin acentos, minúsculas, sin puntuación;
 *    · se descartan palabras vacías y las de menos de 4 letras;
 *    · se comparan conjuntos de palabras y se exige un mínimo de coincidencia;
 *    · dos palabras cuentan como la misma si son iguales o si una empieza por
 *      la otra con 3 letras de diferencia como mucho («crema» / «cremas» sí;
 *      «mascara» / «mascarilla» no). Las palabras de 4 letras solo cuentan
 *      exactas, para no emparejar «cama» con «cámara».
 *
 *  Nada de coincidencias «porque se parecen»: si no se alcanza el umbral, el
 *  producto no se cuenta como vendido en esa tienda.
 * ============================================================================
 */

/** Palabras que no aportan identidad al producto. */
const VACIAS = new Set([
  "con",
  "para",
  "por",
  "del",
  "las",
  "los",
  "una",
  "unos",
  "unas",
  "que",
  "como",
  "mas",
  "más",
  "set",
  "pack",
  "the",
  "and",
  "with",
  "for",
  "from",
  "your",
  "nuevo",
  "nueva",
  "original",
  "premium",
  "oferta",
  "gratis",
  "envio",
  "envío",
  "casa",
  "tienda",
]);

/** Quita acentos y signos, y colapsa espacios. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Palabras significativas de un título (sin vacías ni cortas). */
export function palabrasClave(titulo: string): string[] {
  return normalizarTexto(titulo)
    .split(" ")
    .filter((palabra) => palabra.length >= 4 && !VACIAS.has(palabra) && !/^\d+$/.test(palabra));
}

/**
 * ¿Dos palabras son la misma? Iguales, o una es prefijo de la otra con pocas
 * letras de diferencia (singular/plural y sufijos habituales).
 */
export function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  if (corta.length < 5) return false;
  return larga.startsWith(corta) && larga.length - corta.length <= 3;
}

export interface Coincidencia {
  /** 0–1: proporción de palabras del título más corto que aparecen en el otro. */
  puntuacion: number;
  /** Palabras que comparten (por raíz). */
  comunes: string[];
  /** ¿Supera el umbral exigido? */
  aceptada: boolean;
}

/**
 * Compara dos títulos de producto.
 *
 * @param umbral mínimo de coincidencia para aceptarla (0,7 por defecto:
 *               exige que 7 de cada 10 palabras del título más corto coincidan)
 */
export function compararTitulos(a: string, b: string, umbral = 0.7): Coincidencia {
  const palabrasA = [...new Set(palabrasClave(a))];
  const palabrasB = [...new Set(palabrasClave(b))];

  if (palabrasA.length === 0 || palabrasB.length === 0) {
    return { puntuacion: 0, comunes: [], aceptada: false };
  }

  const comunes: string[] = [];
  for (const palabra of palabrasA) {
    if (palabrasB.some((otra) => mismaPalabra(palabra, otra))) comunes.push(palabra);
  }

  // Se mide sobre el título con menos palabras: un título largo de tienda no
  // debe exigir que el catálogo repita todas sus palabras comerciales.
  const base = Math.min(palabrasA.length, palabrasB.length);
  const puntuacion = comunes.length / base;
  const aceptada = puntuacion >= umbral && comunes.length >= 2;

  return { puntuacion: Math.round(puntuacion * 100) / 100, comunes, aceptada };
}

/**
 * Elige el producto del catálogo que corresponde a un título de tienda.
 * Devuelve el mejor candidato aceptado o null.
 */
export function mejorCoincidencia<T extends { id: string; title: string }>(
  tituloTienda: string,
  candidatos: T[],
  umbral = 0.7,
): { producto: T; coincidencia: Coincidencia } | null {
  let mejor: { producto: T; coincidencia: Coincidencia } | null = null;

  for (const candidato of candidatos) {
    const coincidencia = compararTitulos(tituloTienda, candidato.title, umbral);
    if (!coincidencia.aceptada) continue;
    if (!mejor || coincidencia.puntuacion > mejor.coincidencia.puntuacion) {
      mejor = { producto: candidato, coincidencia };
    }
  }

  return mejor;
}

/** ¿El precio cambió de forma relevante? (más de un 1 % y 0,50 €). */
export function cambioDePrecioRelevante(antes: number, ahora: number): boolean {
  if (antes <= 0 || ahora <= 0) return false;
  const diferencia = Math.abs(ahora - antes);
  return diferencia >= 0.5 && diferencia / antes > 0.01;
}

/**
 * ¿Un término de tendencia (Google Trends) corresponde a un producto?
 *
 * Es más estricto que `compararTitulos`: NO se acepta «se parece». Para dar la
 * señal por buena se exige que **todas** las palabras significativas del
 * término aparezcan en el título del producto.
 *
 *   «crema solar»  ⊂  «Crema solar SPF50 para pieles sensibles»  → sí
 *   «taylor swift» en «Camiseta Taylor Swift Eras Tour»          → sí
 *   «fútbol»       en «Camiseta de fútbol retro»                 → sí
 *   «fútbol»       en «Zapatillas de running»                    → no
 *
 * Si el término no tiene palabras significativas (siglas, cifras: «F1»,
 * «GPT», «iPhone 16»), se compara el término normalizado completo como
 * palabra/frase dentro del título.
 */
export function coincideConTendencia(tituloProducto: string, termino: string): boolean {
  const titulo = ` ${normalizarTexto(tituloProducto)} `;
  const terminoNormalizado = normalizarTexto(termino);
  if (!terminoNormalizado) return false;

  const palabras = palabrasClave(termino);
  if (palabras.length === 0) {
    // Sin palabras de 4+ letras: exigir la frase completa como palabra suelta.
    if (terminoNormalizado.length < 2) return false;
    return titulo.includes(` ${terminoNormalizado} `);
  }

  const palabrasTitulo = palabrasClave(tituloProducto);

  return palabras.every((palabra) => palabrasTitulo.some((otra) => mismaPalabra(palabra, otra)));
}

/**
 * «1M+» → 1 000 000 · «50K+» → 50 000 · «—» → 0.
 * Es el volumen aproximado que publica Google Trends; se guarda como número
 * solo para poder ordenar, nunca como si fuera un volumen exacto.
 */
export function volumenAproximado(volumen: string): number {
  const texto = (volumen ?? "").trim().toUpperCase();
  const coincidencia = texto.match(/([\d.,]+)\s*([KMB])?/);
  if (!coincidencia) return 0;

  // «2,000,000» y «5.000» llevan separadores de millar; «1.5» es decimal.
  const bruto = coincidencia[1];
  const cantidad = /^\d{1,3}([.,]\d{3})+$/.test(bruto)
    ? Number(bruto.replace(/[.,]/g, ""))
    : Number(bruto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(cantidad)) return 0;
  const multiplicador = coincidencia[2] === "K" ? 1_000 : coincidencia[2] === "M" ? 1_000_000 : coincidencia[2] === "B" ? 1_000_000_000 : 1;
  return Math.round(cantidad * multiplicador);
}
