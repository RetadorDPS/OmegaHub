import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes `middleware.ts`) de protección de rutas privadas.
 * Next.js 16 renombró el archivo a `proxy.ts` y la función a `proxy`.
 *
 * Comprobación ligera (compatible con Edge): sólo mira si existe la cookie de
 * sesión de Auth.js. La validación REAL de la sesión (y del rol) se hace en el
 * servidor, en `src/app/dashboard/layout.tsx` y en cada página, usando `auth()`.
 * Este doble control mantiene el middleware rápido y sin acceso a base de datos.
 */

/** Rutas que exigen sesión iniciada. */
const RUTAS_PRIVADAS = ["/dashboard"];
/** Rutas de autenticación: si ya hay sesión, se redirige al panel. */
const RUTAS_PUBLICAS_SOLO_INVITADOS = ["/login", "/register", "/forgot-password", "/reset-password"];

/** Nombres de cookie usados por Auth.js (según protocolo). */
const COOKIES_SESION = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

/** ¿Hay una cookie de sesión presente? */
function tieneCookieDeSesion(request: NextRequest): boolean {
  return COOKIES_SESION.some((nombre) => Boolean(request.cookies.get(nombre)?.value));
}

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const autenticado = tieneCookieDeSesion(request);

  // 1) Ruta privada sin sesión → a /login guardando el destino solicitado.
  if (RUTAS_PRIVADAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    if (!autenticado) {
      const destino = new URL("/login", request.url);
      destino.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(destino);
    }
    return NextResponse.next();
  }

  // 2) Ruta de invitado con sesión activa → al panel.
  if (RUTAS_PUBLICAS_SOLO_INVITADOS.some((ruta) => pathname.startsWith(ruta)) && autenticado) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
