import { BadgeCheck, Package, ShieldCheck, Truck } from "lucide-react";
import { listSuppliers } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { SuppliersBrowser } from "@/components/domain/suppliers-browser";
import type { SupplierPlatform } from "@/types";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lee un parámetro de búsqueda como cadena. */
function parametro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor ?? undefined;
}

export const metadata = {
  title: "Suppliers Finder",
  description: "Proveedores mayoristas verificados con valoración, plazos de envío e índice de precio real.",
};

/** Módulo 5 · Suppliers Finder: directorio de proveedores con filtros. */
export default async function SuppliersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filtros = {
    platform: parametro(params.platform),
    category: parametro(params.category),
    minRating: params.minRating ? Number(parametro(params.minRating)) : undefined,
  };

  const proveedores = await listSuppliers(filtros);

  // Plataformas presentes en el directorio (para el selector de filtros).
  const plataformas = Array.from(new Set(proveedores.map((proveedor) => proveedor.platform))).map((plataforma) => ({
    valor: plataforma as SupplierPlatform,
    etiqueta: {
      ALIEXPRESS: "AliExpress",
      CJ_DROPSHIPPING: "CJ Dropshipping",
      ALIBABA: "Alibaba",
      AMAZON: "Amazon",
      SPOCKET: "Spocket",
      ZENDROP: "Zendrop",
    }[plataforma as SupplierPlatform],
  }));

  const verificados = proveedores.filter((proveedor) => proveedor.verified).length;
  const conTradeAssurance = proveedores.filter((proveedor) => proveedor.tradeAssurance).length;
  const envioMedio =
    proveedores.length > 0
      ? proveedores.reduce((suma, proveedor) => suma + proveedor.shippingTimeDays, 0) / proveedores.length
      : 0;
  const indicePrecioMedio =
    proveedores.length > 0
      ? proveedores.reduce((suma, proveedor) => suma + proveedor.priceIndex, 0) / proveedores.length
      : 0;

  return (
    <>
      <PageHeading
        title="Suppliers Finder"
        description="Directorio de proveedores mayoristas evaluados con datos reales: valoración, reseñas, plazos de envío, pedido mínimo e índice de precio frente al mercado."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Proveedores" value={proveedores.length} icon={Package} hint="en el directorio" />
        <StatCard
          label="Verificados"
          value={verificados}
          icon={BadgeCheck}
          accent="emerald"
          hint={`${conTradeAssurance} con Trade Assurance`}
        />
        <StatCard
          label="Envío medio"
          value={`${envioMedio.toFixed(0)} días`}
          icon={Truck}
          accent="violet"
          hint="hasta el cliente final"
        />
        <StatCard
          label="Índice de precio medio"
          value={`${indicePrecioMedio.toFixed(2)}×`}
          icon={ShieldCheck}
          accent="amber"
          hint="1,00 = precio de mercado"
        />
      </div>

      <SuppliersBrowser
        proveedores={proveedores}
        plataformas={plataformas}
        seleccion={{ platform: filtros.platform, category: filtros.category, minRating: filtros.minRating }}
      />
    </>
  );
}
