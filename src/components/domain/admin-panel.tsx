"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
  UserCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { cn, formatCompactNumber, formatCurrencyPrecise } from "@/lib/utils";
import { PLAN_LABELS, SATURATION_LABELS, type PlanType, type ProductStatus, type SaturationLevel } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

/** Fila de usuario del panel de administración. */
export interface AdminUser {
  id: string;
  nombre: string;
  email: string;
  rol: "USER" | "ADMIN";
  plan: PlanType;
  emailVerificado: boolean;
  renuevaEn: string | null;
  cancelacionProgramada: boolean;
  ultimoAcceso: string | null;
  alta: string;
  guardados: number;
  generacionesIa: number;
  analisis: number;
  tiendasSeguidas: number;
}

/** Fila de producto del catálogo administrativo. */
export interface AdminProduct {
  id: string;
  title: string;
  category: string;
  nicheTag: string;
  trendScore: number;
  estimatedMargin: number;
  saturationLevel: string;
  isGoldenOpportunity: boolean;
  status: string;
  source: string;
  updatedAt: string;
}

/** Análisis de tienda pendiente de revisión. */
export interface AdminScan {
  id: string;
  url: string;
  estado: string;
  motor: string;
  progreso: number;
  duracionMs: number | null;
  error: string | null;
  creadoEn: string;
  finalizadoEn: string | null;
  usuario: string;
  tienda: { id: string; nombre: string; dominio: string; ingresos: number; shopify: boolean } | null;
}

interface AdminPanelProps {
  usuarios: AdminUser[];
  productos: AdminProduct[];
  analisis: AdminScan[];
  imagenes: string[];
}

/**
 * Panel de administración completo.
 *
 * Permite gestionar usuarios (rol, plan y revocación de acceso), el catálogo
 * (alta manual con cálculo real de scores y archivado) y la cola de scrapings
 * (aprobar, descartar o reintentar).
 */
export function AdminPanel({ usuarios, productos, analisis, imagenes }: AdminPanelProps) {
  const router = useRouter();

  const [listaUsuarios, setListaUsuarios] = useState(usuarios);
  const [listaProductos, setListaProductos] = useState(productos);
  const [listaAnalisis, setListaAnalisis] = useState(analisis);
  const [busquedaUsuario, setBusquedaUsuario] = useState("");
  const [filtroPlan, setFiltroPlan] = useState<string>("TODOS");
  const [procesando, setProcesando] = useState<string | null>(null);

  // --- Formulario de alta de producto ---
  const [formulario, setFormulario] = useState({
    title: "",
    description: "",
    category: PRODUCT_CATEGORIES[0] as string,
    nicheTag: "",
    mainImage: imagenes[0] ?? "",
    costPrice: "6.90",
    suggestedSellPrice: "29.90",
    googleSearchVolume: "18000",
    tiktokViews: "900000",
    metaAdsCount: "90",
    storesUsing: "180",
    aliExpressUrl: "",
    cjUrl: "",
    supplierName: "",
  });
  const [creando, setCreando] = useState(false);

  const usuariosFiltrados = listaUsuarios.filter((usuario) => {
    const coincideTexto =
      !busquedaUsuario ||
      usuario.nombre.toLowerCase().includes(busquedaUsuario.toLowerCase()) ||
      usuario.email.toLowerCase().includes(busquedaUsuario.toLowerCase());
    const coincidePlan = filtroPlan === "TODOS" || usuario.plan === filtroPlan;
    return coincideTexto && coincidePlan;
  });

  /** Cambia el rol de un usuario. */
  async function cambiarRol(userId: string, role: "USER" | "ADMIN") {
    setProcesando(`rol-${userId}`);
    try {
      const respuesta = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo cambiar el rol");
      setListaUsuarios((actual) => actual.map((usuario) => (usuario.id === userId ? { ...usuario, rol: role } : usuario)));
      toast.success(role === "ADMIN" ? "Permisos de administrador concedidos" : "Permisos de administrador retirados");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Cambia el plan de un usuario (soporte y cuentas de prueba). */
  async function cambiarPlan(userId: string, planType: PlanType) {
    setProcesando(`plan-${userId}`);
    try {
      const respuesta = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, planType }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo cambiar el plan");
      setListaUsuarios((actual) =>
        actual.map((usuario) => (usuario.id === userId ? { ...usuario, plan: planType } : usuario)),
      );
      toast.success(`Plan cambiado a ${PLAN_LABELS[planType]}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Revoca el acceso de pago de un usuario. */
  async function revocarAcceso(userId: string, email: string) {
    if (!window.confirm(`¿Revocar el acceso de pago de ${email}? La cuenta volverá al plan Free.`)) return;
    setProcesando(`revocar-${userId}`);
    try {
      const respuesta = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, revocarAcceso: true }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo revocar el acceso");
      setListaUsuarios((actual) =>
        actual.map((usuario) =>
          usuario.id === userId ? { ...usuario, plan: "FREE", cancelacionProgramada: false } : usuario,
        ),
      );
      toast.success("Acceso revocado: la cuenta ha vuelto al plan Free");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Archiva o reactiva un producto del catálogo. */
  async function cambiarEstadoProducto(productId: string, status: ProductStatus) {
    setProcesando(`producto-${productId}`);
    try {
      const respuesta = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, status }),
      });
      const datos = (await respuesta.json()) as { error?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo actualizar el producto");
      setListaProductos((actual) => actual.map((producto) => (producto.id === productId ? { ...producto, status } : producto)));
      toast.success(status === "ARCHIVED" ? "Producto archivado" : "Producto publicado");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  /** Da de alta un producto nuevo en el catálogo. */
  async function crearProducto(evento: React.FormEvent) {
    evento.preventDefault();
    setCreando(true);
    try {
      const respuesta = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: formulario.title,
          description: formulario.description,
          category: formulario.category,
          nicheTag: formulario.nicheTag || "General",
          mainImage: formulario.mainImage || imagenes[0],
          images: [formulario.mainImage || imagenes[0]],
          costPrice: Number(formulario.costPrice),
          suggestedSellPrice: Number(formulario.suggestedSellPrice),
          googleSearchVolume: Number(formulario.googleSearchVolume),
          tiktokViews: Number(formulario.tiktokViews),
          metaAdsCount: Number(formulario.metaAdsCount),
          storesUsing: Number(formulario.storesUsing),
          aliExpressUrl: formulario.aliExpressUrl || undefined,
          cjUrl: formulario.cjUrl || undefined,
          supplierName: formulario.supplierName || undefined,
          countryAvailability: ["ES", "MX", "CO"],
        }),
      });
      const datos = (await respuesta.json()) as { error?: string; producto?: { id: string; trendScore: number } };
      if (!respuesta.ok || !datos.producto) throw new Error(datos.error ?? "No se pudo crear el producto");

      toast.success(`Producto publicado con TrendScore ${datos.producto.trendScore}/100`);
      setFormulario((actual) => ({ ...actual, title: "", description: "", nicheTag: "" }));
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreando(false);
    }
  }

  /** Aprueba, descarta o reintenta un scraping. */
  async function gestionarAnalisis(scanId: string, accion: "APROBAR" | "RECHAZAR" | "REINTENTAR") {
    setProcesando(`scan-${scanId}`);
    try {
      const respuesta = await fetch("/api/admin/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion, scanId }),
      });
      const datos = (await respuesta.json()) as { error?: string; message?: string };
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo procesar el análisis");

      setListaAnalisis((actual) =>
        actual.map((analisis) =>
          analisis.id === scanId
            ? {
                ...analisis,
                estado: accion === "APROBAR" ? "COMPLETED" : accion === "RECHAZAR" ? "FAILED" : "QUEUED",
              }
            : analisis,
        ),
      );
      toast.success(
        datos.message ?? (accion === "APROBAR" ? "Scraping aprobado y producto publicado" : "Análisis actualizado"),
      );
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <Tabs defaultValue="usuarios">
      <TabsList className="flex-wrap">
        <TabsTrigger value="usuarios" className="gap-1.5">
          <UserCog className="size-3.5" />
          Usuarios ({usuarios.length})
        </TabsTrigger>
        <TabsTrigger value="productos" className="gap-1.5">
          <Archive className="size-3.5" />
          Catálogo ({productos.length})
        </TabsTrigger>
        <TabsTrigger value="scrapings" className="gap-1.5">
          <Search className="size-3.5" />
          Scrapings ({analisis.length})
        </TabsTrigger>
        <TabsTrigger value="alta" className="gap-1.5">
          <Plus className="size-3.5" />
          Añadir producto
        </TabsTrigger>
      </TabsList>

      {/* --- Usuarios --- */}
      <TabsContent value="usuarios" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={busquedaUsuario}
            onChange={(evento) => setBusquedaUsuario(evento.target.value)}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar usuarios"
            className="sm:max-w-xs"
          />
          <Select value={filtroPlan} onValueChange={setFiltroPlan}>
            <SelectTrigger className="sm:w-48" aria-label="Filtrar por plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los planes</SelectItem>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="PRO">Pro</SelectItem>
              <SelectItem value="BUSINESS">Business</SelectItem>
            </SelectContent>
          </Select>
          <p className="self-center text-xs text-muted-foreground">
            {usuariosFiltrados.length} de {listaUsuarios.length} usuarios
          </p>
        </div>

        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuariosFiltrados.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{usuario.nombre}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          {usuario.email}
                          {usuario.emailVerificado && <BadgeCheck className="size-3 text-emerald-400" />}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Alta <RelativeTime value={usuario.alta} /></p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={usuario.rol === "ADMIN" ? "gradient" : "muted"}>{usuario.rol}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={usuario.plan}
                        onValueChange={(valor) => cambiarPlan(usuario.id, valor as PlanType)}
                      >
                        <SelectTrigger className="h-8 w-32" aria-label={`Plan de ${usuario.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FREE">Free</SelectItem>
                          <SelectItem value="PRO">Pro</SelectItem>
                          <SelectItem value="BUSINESS">Business</SelectItem>
                        </SelectContent>
                      </Select>
                      {usuario.cancelacionProgramada && (
                        <span className="mt-1 block text-[10px] text-amber-300">cancelación programada</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {usuario.guardados} guardados · {usuario.generacionesIa} IA
                      <br />
                      {usuario.analisis} análisis · {usuario.tiendasSeguidas} tiendas
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {usuario.ultimoAcceso ? <RelativeTime value={usuario.ultimoAcceso} /> : "nunca"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={procesando === `rol-${usuario.id}`}
                          onClick={() => cambiarRol(usuario.id, usuario.rol === "ADMIN" ? "USER" : "ADMIN")}
                        >
                          {usuario.rol === "ADMIN" ? "Quitar admin" : "Hacer admin"}
                        </Button>
                        {usuario.plan !== "FREE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-rose-300 hover:text-rose-200"
                            loading={procesando === `revocar-${usuario.id}`}
                            onClick={() => revocarAcceso(usuario.id, usuario.email)}
                          >
                            <ShieldOff className="size-3.5" />
                            Revocar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Catálogo --- */}
      <TabsContent value="productos" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo global</CardTitle>
            <CardDescription>
              Archiva productos desactualizados o vuelve a publicarlos. Los cambios se aplican al instante en todo el
              catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Margen</TableHead>
                  <TableHead>Saturación</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaProductos.map((producto) => (
                  <TableRow key={producto.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/winning-products/${producto.id}`}
                          className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100 hover:text-indigo-300"
                        >
                          {producto.title}
                          <ExternalLink className="size-3" />
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {producto.category} · {producto.nicheTag}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={producto.trendScore >= 80 ? "success" : "muted"}>{producto.trendScore}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">{producto.estimatedMargin.toFixed(0)} %</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          producto.saturationLevel === "LOW"
                            ? "success"
                            : producto.saturationLevel === "MEDIUM"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {SATURATION_LABELS[producto.saturationLevel as SaturationLevel]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {producto.source}
                      <br />
                      <RelativeTime value={producto.updatedAt} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={producto.status === "ACTIVE" ? "default" : "muted"}>
                        {producto.status === "ACTIVE" ? "Publicado" : producto.status === "ARCHIVED" ? "Archivado" : "Pendiente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {producto.status === "ACTIVE" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            loading={procesando === `producto-${producto.id}`}
                            onClick={() => cambiarEstadoProducto(producto.id, "ARCHIVED")}
                          >
                            <Trash2 className="size-3.5" />
                            Archivar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            loading={procesando === `producto-${producto.id}`}
                            onClick={() => cambiarEstadoProducto(producto.id, "ACTIVE")}
                          >
                            <RotateCcw className="size-3.5" />
                            Publicar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Scrapings --- */}
      <TabsContent value="scrapings" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cola de análisis de tiendas</CardTitle>
            <CardDescription>
              Revisa los scrapings ejecutados por los usuarios: apruébalos para publicar sus productos, descártalos o
              devuélvelos a la cola.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {listaAnalisis.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Todavía no se ha ejecutado ningún análisis de tienda.
              </p>
            ) : (
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Motor</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaAnalisis.map((analisis) => (
                    <TableRow key={analisis.id}>
                      <TableCell>
                        <p className="text-sm text-slate-100">{analisis.tienda?.nombre ?? analisis.url}</p>
                        <p className="text-xs text-muted-foreground">
                          {analisis.tienda?.dominio ?? analisis.url}
                          {analisis.tienda ? ` · ${formatCompactNumber(analisis.tienda.ingresos)} $/mes` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground"><RelativeTime value={analisis.creadoEn} /></p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{analisis.usuario}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            analisis.estado === "COMPLETED"
                              ? "success"
                              : analisis.estado === "FAILED"
                                ? "danger"
                                : analisis.estado === "RUNNING"
                                  ? "warning"
                                  : "muted"
                          }
                        >
                          {analisis.estado}
                        </Badge>
                        {analisis.error && <p className="mt-1 max-w-[16rem] text-[11px] text-rose-300">{analisis.error}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {analisis.motor === "PLAYWRIGHT" ? "Playwright" : "Determinista"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {analisis.duracionMs ? `${analisis.duracionMs} ms` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            loading={procesando === `scan-${analisis.id}`}
                            onClick={() => gestionarAnalisis(analisis.id, "APROBAR")}
                          >
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            Aprobar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"                            loading={procesando === `scan-${analisis.id}`}
                            onClick={() => gestionarAnalisis(analisis.id, "REINTENTAR")}
                          >
                            <RotateCcw className="size-3.5" />
                            Reintentar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn("gap-1.5 text-rose-300 hover:text-rose-200")}
                            loading={procesando === `scan-${analisis.id}`}
                            onClick={() => gestionarAnalisis(analisis.id, "RECHAZAR")}
                          >
                            <XCircle className="size-3.5" />
                            Descartar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Alta manual --- */}
      <TabsContent value="alta">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Añadir producto al catálogo</CardTitle>
            <CardDescription>
              El TrendScore, el nivel de saturación y el margen se calculan con el motor real de tendencias a partir de
              las métricas que introduzcas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={crearProducto}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="prod-titulo">Título</Label>
                  <Input
                    id="prod-titulo"
                    value={formulario.title}
                    onChange={(evento) => setFormulario({ ...formulario, title: evento.target.value })}
                    placeholder="Ej. Masajeador cervical con calor"
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="prod-descripcion">Descripción</Label>
                  <Textarea
                    id="prod-descripcion"
                    value={formulario.description}
                    onChange={(evento) => setFormulario({ ...formulario, description: evento.target.value })}
                    placeholder="Describe el producto, su público y su propuesta de valor (mínimo 20 caracteres)."
                    required
                    minLength={20}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select
                    value={formulario.category}
                    onValueChange={(valor) => setFormulario({ ...formulario, category: valor })}
                  >
                    <SelectTrigger aria-label="Categoría del producto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map((categoria) => (
                        <SelectItem key={categoria} value={categoria}>
                          {categoria}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-nicho">Nicho</Label>
                  <Input
                    id="prod-nicho"
                    value={formulario.nicheTag}
                    onChange={(evento) => setFormulario({ ...formulario, nicheTag: evento.target.value })}
                    placeholder="Ej. Dolor cervical"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Imagen principal</Label>
                  <div className="flex flex-wrap gap-2">
                    {imagenes.slice(0, 6).map((imagen) => (
                      <button
                        key={imagen}
                        type="button"
                        onClick={() => setFormulario({ ...formulario, mainImage: imagen })}
                        className={cn(
                          "relative size-16 overflow-hidden rounded-lg border-2 transition-colors",
                          formulario.mainImage === imagen ? "border-indigo-500" : "border-transparent opacity-70",
                        )}
                        title={imagen.split("/").pop()}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imagen} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <Input
                    value={formulario.mainImage}
                    onChange={(evento) => setFormulario({ ...formulario, mainImage: evento.target.value })}
                    placeholder="O pega una URL de imagen"
                    aria-label="URL de la imagen principal"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-coste">Coste del proveedor (US$)</Label>
                  <Input
                    id="prod-coste"
                    type="number"
                    step="0.01"
                    min="0.5"
                    value={formulario.costPrice}
                    onChange={(evento) => setFormulario({ ...formulario, costPrice: evento.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-venta">Precio de venta (US$)</Label>
                  <Input
                    id="prod-venta"
                    type="number"
                    step="0.01"
                    min="1"
                    value={formulario.suggestedSellPrice}
                    onChange={(evento) => setFormulario({ ...formulario, suggestedSellPrice: evento.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-google">Búsquedas mensuales en Google</Label>
                  <Input
                    id="prod-google"
                    type="number"
                    min="0"
                    value={formulario.googleSearchVolume}
                    onChange={(evento) => setFormulario({ ...formulario, googleSearchVolume: evento.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-tiktok">Visualizaciones en TikTok</Label>
                  <Input
                    id="prod-tiktok"
                    type="number"
                    min="0"
                    value={formulario.tiktokViews}
                    onChange={(evento) => setFormulario({ ...formulario, tiktokViews: evento.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-anuncios">Anuncios activos en Meta</Label>
                  <Input
                    id="prod-anuncios"
                    type="number"
                    min="0"
                    value={formulario.metaAdsCount}
                    onChange={(evento) => setFormulario({ ...formulario, metaAdsCount: evento.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-tiendas">Tiendas Shopify que lo venden</Label>
                  <Input
                    id="prod-tiendas"
                    type="number"
                    min="0"
                    value={formulario.storesUsing}
                    onChange={(evento) => setFormulario({ ...formulario, storesUsing: evento.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-aliexpress">Enlace de AliExpress</Label>
                  <Input
                    id="prod-aliexpress"
                    value={formulario.aliExpressUrl}
                    onChange={(evento) => setFormulario({ ...formulario, aliExpressUrl: evento.target.value })}
                    placeholder="https://es.aliexpress.com/item/…"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prod-cj">Enlace de CJ Dropshipping</Label>
                  <Input
                    id="prod-cj"
                    value={formulario.cjUrl}
                    onChange={(evento) => setFormulario({ ...formulario, cjUrl: evento.target.value })}
                    placeholder="https://cjdropshipping.com/product/…"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={creando} className="gap-2">
                  {!creando && <Plus className="size-4" />}
                  Publicar en el catálogo
                </Button>
                <p className="text-xs text-muted-foreground">
                  Precio de venta recomendado actual:{" "}
                  {formatCurrencyPrecise(Number(formulario.suggestedSellPrice) || 0)} · margen bruto{" "}
                  {Number(formulario.suggestedSellPrice) > 0
                    ? (
                        ((Number(formulario.suggestedSellPrice) - Number(formulario.costPrice)) /
                          Number(formulario.suggestedSellPrice)) *
                        100
                      ).toFixed(1)
                    : "0"}
                  %
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
