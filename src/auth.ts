import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
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

/** ¿Está configurado el proveedor de Google OAuth? */
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
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
    /** Añade id, rol y plan a la sesión expuesta al cliente. */
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: Role }).role ?? "USER";
        session.user.planType = (user as { planType?: PlanType }).planType ?? "FREE";
        session.user.isEmailVerified = Boolean((user as { emailVerified?: Date | null }).emailVerified);
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
