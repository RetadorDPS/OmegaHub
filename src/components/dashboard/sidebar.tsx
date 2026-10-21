"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  LayoutDashboard,
  KeyRound,
  LineChart,
  Megaphone,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV, DATA_SOURCES, type NavItem } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import type { PlanType } from "@/types";

/** Mapa de iconos usado por la navegación (evita importar todo el paquete). */
const ICONOS: Record<string, typeof Trophy> = {
  Activity,
  LayoutDashboard,
  KeyRound,
  Trophy,
  Megaphone,
  Store,
  Radar,
  LineChart,
  Truck,
  Users,
  Sparkles,
  Settings,
  ShieldCheck,
};

interface SidebarProps {
  /** Rol del usuario: los elementos `adminOnly` sólo se muestran al admin. */
  role: "USER" | "ADMIN";
  /** Plan contratado, mostrado en la tarjeta inferior. */
  plan: PlanType;
  /** Se invoca al pulsar un enlace (para cerrar el menú en móvil). */
  onNavigate?: () => void;
  className?: string;
}

/** Barra lateral con la navegación principal del dashboard. */
export function Sidebar({ role, plan, onNavigate, className }: SidebarProps) {
  const pathname = usePathname();
  // Orden de planes (local, sin importar planLimits del cliente:
  // arrastra Prisma/pg al bundle).
  const ORDEN_PLANES = ["FREE", "PRO", "BUSINESS", "AGENCY"] as const;
  const nivelPlan = ORDEN_PLANES.indexOf(plan as (typeof ORDEN_PLANES)[number]);

  const items = DASHBOARD_NAV.filter((item) => {
    if (item.adminOnly && role !== "ADMIN") return false;
    if (item.minPlan) {
      return ORDEN_PLANES.indexOf(item.minPlan) <= nivelPlan;
    }
    return true;
  });

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-slate-950/95 backdrop-blur",
        className,
      )}
    >
      {/* Marca */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 py-5 transition-opacity hover:opacity-90"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50">
          <Zap className="size-5 text-white" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">TrendHunter</span>
          <span className="text-[11px] font-medium text-indigo-400">PRO</span>
        </span>
      </Link>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación principal">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icono = ICONOS[item.icon] ?? Trophy;
            const activo =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    activo
                      ? "bg-gradient-to-r from-indigo-600/25 to-violet-600/10 text-white"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  {/* Indicador lateral animado del elemento activo */}
                  {activo && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icono
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      activo ? "text-indigo-400" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.badge === "hot" && (
                    <Badge variant="danger" className="ml-auto px-1.5 py-0 text-[10px]">
                      HOT
                    </Badge>
                  )}
                  {item.badge === "live" && (
                    <Badge variant="success" className="ml-auto px-1.5 py-0 text-[10px]">
                      LIVE
                    </Badge>
                  )}
                  {item.badge === "ai" && (
                    <Badge variant="violet" className="ml-auto px-1.5 py-0 text-[10px]">
                      IA
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Fuentes de datos en vivo */}
        <div className="mt-6 rounded-xl border border-border/60 bg-surface/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Fuentes conectadas
          </p>
          <ul className="space-y-1.5">
            {DATA_SOURCES.map((fuente) => (
              <li key={fuente.name} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                {fuente.name}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Plan actual */}
      <div className="border-t border-border/70 p-3">
        <Link
          href="/dashboard/settings/billing"
          onClick={onNavigate}
          className="flex items-center justify-between rounded-lg bg-gradient-to-r from-indigo-600/20 to-violet-600/10 px-3 py-2.5 transition-colors hover:from-indigo-600/30"
        >
          <span className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Plan actual</span>
            <span className="text-sm font-semibold">{plan}</span>
          </span>
          <Badge variant={plan === "FREE" ? "muted" : "gradient"} className="text-[10px]">
            {plan === "FREE" ? "Mejorar" : "Activo"}
          </Badge>
        </Link>
      </div>
    </aside>
  );
}

export type { NavItem };
