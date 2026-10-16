/**
 * Sesión de demostración para el sitio estático de GitHub Pages.
 *
 * La exportación estática no tiene servidor ni cookies, así que `auth()`
 * devuelve siempre la cuenta de administración real del seed (ADMIN ·
 * BUSINESS) para que el panel completo —incluido el módulo de administración—
 * sea navegable y las consultas usen un usuario que existe en la base de datos.
 * Este fichero sustituye a `src/auth.ts` solo dentro de `npm run build:pages`.
 */
import prisma from "@/lib/prisma";
import type { PlanType, Role } from "@/types";

const CORREO_DEMOSTRACION = "admin@trendhunter.pro";

/**
 * Sesión que consume el proveedor de cliente. Solo se usa para mostrar el
 * nombre, el plan y el rol en la interfaz: las consultas de servidor usan
 * `auth()`, que lee el usuario administrador real de la base de datos.
 */
export const SESION_ESTATICA = {
  user: {
    id: "usuario-demostracion",
    name: "Ariadna Ferrer",
    email: CORREO_DEMOSTRACION,
    image: null as string | null,
    role: "ADMIN" as Role,
    planType: "BUSINESS" as PlanType,
    isEmailVerified: true,
  },
  expires: "2099-12-31T23:59:59.999Z",
};

/** Usuario de demostración (el administrador del seed). */
async function usuarioDemostracion() {
  const usuario = await prisma.user.findUnique({
    where: { email: CORREO_DEMOSTRACION },
    select: { id: true, name: true, email: true, image: true, role: true, planType: true },
  });
  if (!usuario) throw new Error("El sitio estático necesita los datos de demo: ejecuta `npm run setup`.");
  return usuario;
}

/** Misma interfaz que la autenticación real, sin acceso a cookies. */
export async function auth() {
  const usuario = await usuarioDemostracion();
  return {
    user: {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      image: usuario.image,
      role: usuario.role,
      planType: usuario.planType,
      isEmailVerified: true,
    },
    expires: "2099-12-31T23:59:59.999Z",
  };
}

export async function signIn() {
  return { ok: false, error: "El acceso requiere el servidor de TrendHunter Pro." };
}

export async function signOut() {
  return undefined;
}

export const handlers = {
  GET: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  POST: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
};
