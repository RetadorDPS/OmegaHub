import { Globe2, Layers, Megaphone, Timer } from "lucide-react";
import { auth } from "@/auth";
import {
  getAdNiches,
  getAdStats,
  getSavedProductIds,
  listAds,
} from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { AdCard } from "@/components/domain/ad-card";
import { AdFiltersBar } from "@/components/domain/ad-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { AdPlatform } from "@/types";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lee un parámetro de búsqueda como cadena. */
function parametro(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

export const metadata = {
  title: "Ads Spy",
  description: "Biblioteca de anuncios activos en Facebook, TikTok e Instagram con métricas de engagement.",
};

/** Módulo 6 · Ads Spy: cuadrícula tipo Pinterest con anuncios reales. */
export default async function AdsSpyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [sesion, nichos, stats] = await Promise.all([auth(), getAdNiches(), getAdStats()]);

  const plataforma = parametro(params.platform) as AdPlatform | undefined;
  const filtros = {
    platform: plataforma,
    niche: parametro(params.niche),
    country: parametro(params.country),
    sort: (parametro(params.sort) as "recent" | "engagement" | "longest-running" | "most-liked") ?? "recent",
    minEngagement: params.minEngagement ? Number(parametro(params.minEngagement)) : undefined,
    minDaysActive: params.minDaysActive ? Number(parametro(params.minDaysActive)) : undefined,
    search: parametro(params.search),
  };

  const [anuncios, guardados] = await Promise.all([
    listAds(filtros),
    sesion?.user?.id ? getSavedProductIds(sesion.user.id) : Promise.resolve([]),
  ]);

  const contarPlataforma = (objetivo: AdPlatform) =>
    stats.porPlataforma.find((fila) => fila.platform === objetivo)?.count ?? 0;

  const engagementMedio =
    anuncios.length > 0
      ? anuncios.reduce((suma, anuncio) => suma + anuncio.engagementRate, 0) / anuncios.length
      : 0;

  return (
    <>
      <PageHeading
        title="Ads Spy"
        description="Anuncios activos de la competencia con métricas reales de engagement, días activos y país objetivo."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Anuncios en la biblioteca"
          value={String(stats.total)}
          icon={Megaphone}
          hint="Facebook, TikTok e Instagram"
        />
        <StatCard
          label="TikTok Ads"
          value={String(contarPlataforma("TIKTOK"))}
          icon={Layers}
          accent="violet"
          hint="Creatividades verticales con mayor alcance"
        />
        <StatCard
          label="Días activo (máximo)"
          value={String(stats.masLargo?.daysActive ?? 0)}
          icon={Timer}
          accent="amber"
          hint={stats.masLargo ? `${stats.masLargo.advertiserName}` : "Sin datos"}
        />
        <StatCard
          label="Engagement medio"
          value={`${engagementMedio.toFixed(1)} %`}
          icon={Globe2}
          accent="emerald"
          hint="Sobre los anuncios filtrados"
        />
      </div>

      <AdFiltersBar
        nichos={nichos}
        stats={{
          total: stats.total,
          tiktok: contarPlataforma("TIKTOK"),
          facebook: contarPlataforma("FACEBOOK"),
          instagram: contarPlataforma("INSTAGRAM"),
          masLargoDias: stats.masLargo?.daysActive ?? 0,
        }}
        seleccion={{
          platform: filtros.platform,
          niche: filtros.niche,
          country: filtros.country,
          sort: filtros.sort,
          minEngagement: filtros.minEngagement,
          minDaysActive: filtros.minDaysActive,
          search: filtros.search,
        }}
      />

      {anuncios.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No hay anuncios con estos filtros"
          description="Prueba a quitar el filtro de plataforma, país o engagement para ver más creatividades."
          action={
            <Button asChild variant="outline">
              <a href="/dashboard/ads-spy">Ver todos los anuncios</a>
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-foreground">
            Mostrando <span className="font-semibold text-slate-100">{anuncios.length}</span> anuncios ordenados por{" "}
            {filtros.sort === "engagement"
              ? "engagement"
              : filtros.sort === "longest-running"
                ? "tiempo activo"
                : filtros.sort === "most-liked"
                  ? "likes"
                  : "fecha de detección"}
            .
          </p>

          {/* Cuadrícula tipo Pinterest (masonry por columnas CSS) */}
          <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
            {anuncios.map((anuncio, indice) => (
              <AdCard
                key={anuncio.id}
                ad={anuncio}
                index={indice}
                priority={indice < 9}
                saved={Boolean(anuncio.productId && guardados.includes(anuncio.productId))}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
