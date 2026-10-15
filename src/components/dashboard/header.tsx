"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Bell,
  Check,
  CreditCard,
  Globe,
  LogOut,
  Menu,
  Search,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LOCALES } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";
import type { NotificationDTO, PlanType, Role } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

/** Icono y color por tipo de notificación. */
const ESTILOS_NOTIFICACION: Record<string, string> = {
  TREND_ALERT: "bg-indigo-500/15 text-indigo-300",
  NEW_PRODUCT: "bg-emerald-500/15 text-emerald-300",
  STORE_CHANGE: "bg-amber-500/15 text-amber-300",
  PRICE_CHANGE: "bg-orange-500/15 text-orange-300",
  SUBSCRIPTION: "bg-violet-500/15 text-violet-300",
  SYSTEM: "bg-slate-500/15 text-slate-300",
};

interface HeaderProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role: Role; planType: PlanType };
  notifications: NotificationDTO[];
  unreadCount: number;
  onOpenMenu: () => void;
}

/** Cabecera del dashboard: buscador, idioma, notificaciones y perfil. */
export function Header({ user, notifications, unreadCount, onOpenMenu }: HeaderProps) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [leidas, setLeidas] = useState<string[]>([]);

  const noLeidas = Math.max(0, unreadCount - leidas.length);

  /** Busca productos y anuncios con el término introducido. */
  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const termino = busqueda.trim();
    if (!termino) return;
    router.push(`/dashboard/winning-products?search=${encodeURIComponent(termino)}`);
  }

  /** Marca una notificación como leída (optimista en cliente + API). */
  async function marcarLeida(id: string) {
    setLeidas((previas) => (previas.includes(id) ? previas : [...previas, id]));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  /** Marca todas como leídas. */
  async function marcarTodas() {
    setLeidas(notifications.map((notificacion) => notificacion.id));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-slate-950/80 px-4 backdrop-blur-lg lg:px-6">
      {/* Botón de menú en móvil */}
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMenu} aria-label="Abrir menú">
        <Menu />
      </Button>

      {/* Buscador global */}
      <form onSubmit={buscar} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar productos, nichos o anuncios…"
          className="pl-9"
          aria-label="Buscador global"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Selector de idioma */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Cambiar idioma">
              <Globe />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Idioma de la interfaz</DropdownMenuLabel>
            {LOCALES.map((locale) => (
              <DropdownMenuItem key={locale.code} onClick={() => setIdioma(locale.code)}>
                <span aria-hidden>{locale.flag}</span>
                <span>{locale.label}</span>
                {idioma === locale.code && <Check className="ml-auto text-indigo-400" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notificaciones */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificaciones">
              <Bell />
              {noLeidas > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {noLeidas > 9 ? "9+" : noLeidas}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Notificaciones</p>
                <p className="text-xs text-muted-foreground">{noLeidas} sin leer</p>
              </div>
              {noLeidas > 0 && (
                <Button variant="ghost" size="sm" onClick={marcarTodas}>
                  Marcar todas
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No tienes notificaciones todavía.
                </p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {notifications.map((notificacion) => {
                    const leida = notificacion.read || leidas.includes(notificacion.id);
                    const contenido = (
                      <div className="flex gap-3 px-4 py-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                            ESTILOS_NOTIFICACION[notificacion.type] ?? ESTILOS_NOTIFICACION.SYSTEM,
                          )}
                        >
                          <Bell className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm", leida ? "font-normal text-muted-foreground" : "font-medium")}>
                            {notificacion.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notificacion.message}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground/70">
                            <RelativeTime value={notificacion.createdAt} />
                          </p>
                        </div>
                        {!leida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-500" />}
                      </div>
                    );

                    return (
                      <li
                        key={notificacion.id}
                        className={cn("transition-colors hover:bg-surface/50", !leida && "bg-indigo-500/[0.04]")}
                      >
                        {notificacion.actionUrl ? (
                          <Link
                            href={notificacion.actionUrl}
                            onClick={() => marcarLeida(notificacion.id)}
                            className="block"
                          >
                            {contenido}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => marcarLeida(notificacion.id)}
                          >
                            {contenido}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Perfil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-colors hover:bg-surface"
              aria-label="Menú de usuario"
            >
              <Avatar>
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
              </Avatar>
              <span className="hidden flex-col items-start leading-tight lg:flex">
                <span className="text-xs font-medium">{user.name ?? "Usuario"}</span>
                <span className="text-[10px] text-muted-foreground">{user.email}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5">
                <p className="text-sm font-medium">{user.name ?? "Usuario"}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Badge variant={user.planType === "FREE" ? "muted" : "gradient"} className="text-[10px]">
                    {user.planType}
                  </Badge>
                  {user.role === "ADMIN" && (
                    <Badge variant="warning" className="text-[10px]">
                      ADMIN
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <UserIcon />
                Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings/billing">
                <CreditCard />
                Suscripción y facturación
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings />
                Preferencias
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-300 focus:bg-rose-500/15"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
