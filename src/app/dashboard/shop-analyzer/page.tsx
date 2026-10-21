import { auth } from "@/auth";
import { listTrackedStores } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { ShopAnalyzerClient } from "@/components/domain/shop-analyzer-client";

export const metadata = {
  title: "Shop Analyzer",
  description: "Analiza cualquier tienda Shopify: facturación, tráfico, top productos, categorías y tecnología.",
};

/** Módulo 7 · Shop Analyzer. */
export default async function ShopAnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const sesion = await auth();
  const seguidas = sesion?.user?.id ? await listTrackedStores(sesion.user.id) : [];
  // Deep link desde la extensión de Chrome: /dashboard/shop-analyzer?url=…
  const { url: urlInicial } = await searchParams;

  return (
    <>
      <PageHeading
        title="Shop Analyzer"
        description="Introduce el dominio de una tienda de la competencia y obtén su facturación estimada, tráfico, catálogo completo y stack tecnológico."
      />
      <ShopAnalyzerClient
        seguidas={seguidas.map((tienda) => ({ storeId: tienda.id, storeName: tienda.name }))}
        urlInicial={urlInicial}
      />
    </>
  );
}
