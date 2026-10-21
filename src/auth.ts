import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { planEfectivo } from "@/lib/equipos";
import { sendWelcomeEmail, sendVerificationEmail } from "@/lib/mail";
import type { PlanType, Role } from "@/types";

/**
 * ============================================================================
 *  AUTENTICACIÓN (Auth.js / NextAuth v5)
 * ============================================================================
 *  · Sesiones persistidas en base de datos (adaptador Prisma).
 *  · Proveedor de credenciales (email + contraseña con bcrypt).
 *  · Proveedor de Google (se activa si existen GOOGLE_CLIENT_ID/SECRET).
 *  · Verificación de email y correo de bienvenida vía eventos.
 *  · Rol y plan del usuario viajan en el token y en la sesión.
 * ============================================================================
 */

/** Esquema de validación del formulario de acceso. */
const credencialesSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      planType: PlanType;
      /**
       * `true` si el correo está verificado. Se expone con un nombre propio
       * (`isEmailVerified`) para no chocar con el `emailVerified: Date` que
       * Auth.js usa internamente en el adaptador.
       */
      isEmailVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    planType?: PlanType;
  }
}

/** Campos propios que se añaden al token de sesión de Auth.js. */
interface CamposToken {
  id?: string;
  role?: Role;
  planType?: PlanType;
  name?: string | null;
  picture?: string | null;
  /** Marca temporal del último refresco de datos desde la base de datos. */
  lastChecked?: number;
}

/** ¿Está configurado el proveedor de Google OAuth? */
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  /**
   * Estrategia JWT obligatoria: Auth.js no admite el proveedor de credenciales
   * con sesiones persistidas en base de datos. El adaptador Prisma sigue
   * gestionando usuarios y cuentas OAuth; la sesión viaja firmada en cookie.
   */
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "trendhunter-dev-secret-change-me",
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/dashboard",
  },
  providers: [
    // Sólo se registra Google si hay credenciales, para que el login funcione
    // igualmente en local sin configurar OAuth.
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "Email y contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (credenciales) => {
        const parsed = credencialesSchema.safeParse(credenciales);
        if (!parsed.success) return null;

        const usuario = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!usuario?.passwordHash) return null;

        const contrasenaCorrecta = await compare(parsed.data.password, usuario.passwordHash);
        if (!contrasenaCorrecta) return null;

        // Registro de acceso para métricas de uso.
        await prisma.user.update({
          where: { id: usuario.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.name,
          image: usuario.image,
          role: usuario.role as Role,
          planType: usuario.planType as PlanType,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Construye el token de sesión.
     * En el inicio de sesión guarda id, rol y plan; después los refresca desde
     * la base de datos como máximo una vez por minuto, de modo que un cambio de
     * plan (webhook de Stripe) se refleje sin obligar al usuario a reingresar.
     */
    jwt: async ({ token, user, trigger }) => {
      const tokenExtendido = token as typeof token & CamposToken;
      if (user) {
        tokenExtendido.id = user.id;
        tokenExtendido.role = (user as { role?: Role }).role ?? "USER";
        tokenExtendido.planType = (user as { planType?: PlanType }).planType ?? "FREE";
        tokenExtendido.lastChecked = Date.now();
      }

      // Se refresca cuando el cliente pide actualizar la sesión (tras cambiar de
      // plan, por ejemplo) o, como máximo, cada 15 segundos de navegación.
      const debeRefrescar =
        Boolean(tokenExtendido.id) &&
        (trigger === "update" || Date.now() - (tokenExtendido.lastChecked ?? 0) > 15_000);
      if (debeRefrescar) {
        const actual = await prisma.user
          .findUnique({
            where: { id: tokenExtendido.id },
            select: { role: true, planType: true, name: true, image: true },
          })
          .catch(() => null);
        if (actual) {
          tokenExtendido.role = actual.role as Role;
          // Plan efectivo: si el usuario es miembro de un equipo Business o
          // Agency, hereda ese plan aunque el suyo sea Free (no paga dos veces).
          tokenExtendido.planType = await planEfectivo(tokenExtendido.id!, actual.planType as PlanType).catch(
            () => actual.planType as PlanType,
          );
          tokenExtendido.name = actual.name;
          tokenExtendido.picture = actual.image;
          // Marca de actividad del miembro (sirve para ver quién usa el equipo).
          await prisma.teamMember
            .updateMany({
              where: { userId: tokenExtendido.id, status: "ACTIVE" },
              data: { lastActiveAt: new Date() },
            })
            .catch(() => null);
        }
        tokenExtendido.lastChecked = Date.now();
      }
      return token;
    },
    /** Expone los datos del token en la sesión que consume la aplicación. */
    session: async ({ session, token }) => {
      const tokenExtendido = token as typeof token & CamposToken;
      if (session.user) {
        session.user.id = tokenExtendido.id ?? "";
        session.user.role = tokenExtendido.role ?? "USER";
        session.user.planType = tokenExtendido.planType ?? "FREE";
        session.user.isEmailVerified = true;
      }
      return session;
    },
  },
  events: {
    /** Envía el correo de bienvenida / verificación al crear la cuenta. */
    createUser: async ({ user }) => {
      if (!user.email) return;
      try {
        await sendWelcomeEmail({ email: user.email, name: user.name ?? undefined });
        const token = crypto.randomUUID();
        await prisma.verificationToken.create({
          data: {
            identifier: user.email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await sendVerificationEmail({ email: user.email, name: user.name ?? undefined, token });
      } catch (error) {
        // El registro nunca debe fallar porque el correo no esté configurado.
        console.warn("[auth] No se pudo enviar el correo de bienvenida:", (error as Error).message);
      }
    },
    /** Registra el último acceso cuando la sesión es creada por otro proveedor. */
    signIn: async ({ user }) => {
      if (!user.id) return;
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    },
  },
  debug: false,
});
