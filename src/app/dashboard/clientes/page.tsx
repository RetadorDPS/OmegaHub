import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { PageHeading } from "@/components/domain/page-heading";
import { ClientesForm } from "./clientes-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { EliminarCliente } from "./eliminar-cliente";

/**
 * Modo agencia (plan BUSINESS+): los clientes
 * del usuario y a qué seguimientos están asignados.
 */
export default async function ClientesPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/login");

  const esAgencia =
    sesion.user.planType === "BUSINESS" || sesion.user.planType === "AGENCY";
  if (!esAgencia) redirect("/dashboard");

  const clientes = await prisma.cliente.findMany({
    where: { ownerId: sesion.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      followedStores: { select: { id: true } },
      followedProducts: { select: { id: true } },
    },
  });

  return (
    <>
      <PageHeading
        title="Clientes"
        description="Modo agencia: gestiona los clientes a los que asignas productos y tiendas seguidas."
        actions={<ClientesForm />}
      />

      {clientes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aún no hay clientes. Crea el primero con el formulario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map((cliente) => (
            <Card key={cliente.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{cliente.nombre}</CardTitle>
                  <EliminarCliente id={cliente.id} nombre={cliente.nombre} />
                </div>
                {cliente.dominio && (
                  <p className="text-xs text-muted-foreground">{cliente.dominio}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {cliente.notas && (
                  <p className="text-xs text-muted-foreground">{cliente.notas}</p>
                )}
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {cliente.followedProducts.length} productos
                  </Badge>
                  <Badge variant="outline">
                    {cliente.followedStores.length} tiendas
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Creado {cliente.createdAt.toLocaleDateString("es-ES")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
