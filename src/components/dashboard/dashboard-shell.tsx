"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { NotificationDTO, PlanType, Role } from "@/types";

interface DashboardShellProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role: Role; planType: PlanType };
  notifications: NotificationDTO[];
  unreadCount: number;
  children: React.ReactNode;
}

/**
 * Estructura visual del dashboard: barra lateral fija en escritorio, cajón
 * deslizante en móvil y cabecera fija con buscador, notificaciones y perfil.
 */
export function DashboardShell({ user, notifications, unreadCount, children }: DashboardShellProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        {/* Barra lateral de escritorio */}
        <div className="sticky top-0 hidden h-screen lg:block">
          <Sidebar role={user.role} plan={user.planType} />
        </div>

        {/* Cajón lateral de móvil */}
        <AnimatePresence>
          {menuAbierto && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
                onClick={() => setMenuAbierto(false)}
              />
              <motion.div
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="fixed inset-y-0 left-0 z-50 lg:hidden"
              >
                <Sidebar role={user.role} plan={user.planType} onNavigate={() => setMenuAbierto(false)} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-3 top-4"
                  onClick={() => setMenuAbierto(false)}
                  aria-label="Cerrar menú"
                >
                  <X />
                </Button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Contenido */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            user={user}
            notifications={notifications}
            unreadCount={unreadCount}
            onOpenMenu={() => setMenuAbierto(true)}
          />
          <main className="flex-1 px-4 py-6 lg:px-6 lg:py-8">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mx-auto w-full max-w-[1600px]"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
