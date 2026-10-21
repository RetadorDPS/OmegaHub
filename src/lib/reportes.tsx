import type { ReactNode } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ProductDTO, StoreDTO, TrendMetricDTO, PlanType } from "@/types";

/**
 * ============================================================================
 *  INFORMES PDF (marca de agua del plan + procedencia)
 * ============================================================================
 *  Se generan en el servidor con @react-pdf/renderer.
 *  Cada cifra lleva su procedencia (fuente + fecha + tipo).
 *  El plan del usuario aparece como marca de agua.
 * ============================================================================
 */

const estilos = StyleSheet.create({
  pagina: {
    flexDirection: "column",
    padding: 32,
    fontSize: 10,
    color: "#1e293b",
  },
  marcaAgua: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.06,
  },
  marcaAguaTexto: {
    fontSize: 72,
    fontWeight: "bold",
    color: "#0f172a",
    transform: "rotate(-30deg)",
  },
  cabecera: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#6366f1",
    paddingBottom: 8,
    marginBottom: 16,
  },
  titulo: { fontSize: 20, fontWeight: "bold", color: "#4338ca" },
  subtitulo: { fontSize: 10, color: "#64748b", marginTop: 2 },
  seccion: { fontSize: 13, fontWeight: "bold", color: "#4338ca", marginTop: 14, marginBottom: 6 },
  tabla: { display: "flex", flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  fila: { width: "100%", display: "flex", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 5 },
  celda: { width: "33.33%", paddingHorizontal: 4 },
  etiqueta: { fontSize: 9, color: "#64748b" },
  valor: { fontSize: 10, fontWeight: "bold" },
  insignia: { fontSize: 8, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: "hidden" },
  pie: { marginTop: 24, fontSize: 8, color: "#94a3b8", textAlign: "center" as const },
});

/** Color de la insignia según el tipo de dato. */
const COLOR_TIPO: Record<string, string> = {
  MEDIDO: "#10b981",
  IMPORTADO: "#0ea5e9",
  ESTIMADO: "#f59e0b",
  MIXTO: "#8b5cf6",
};

/** Color del sello de confianza en el PDF. */
const COLOR_CONFIANZA: Record<string, string> = {
  VERIFICADO: "#10b981",
  PARCIAL: "#f59e0b",
  ESTIMADO: "#64748b",
  SIN_DATOS: "#475569",
};

/** Tabla de métricas con procedencia. */
function TablaMetricas({ metricas }: { metricas: TrendMetricDTO[] }) {
  return (
    <View style={estilos.tabla}>
      {metricas.slice(-12).map((m) => (
        <View key={m.date} style={estilos.fila}>
          <View style={estilos.celda}>
            <Text style={estilos.etiqueta}>Fecha</Text>
            <Text style={estilos.valor}>{new Date(m.date).toLocaleDateString("es-ES")}</Text>
          </View>
          <View style={estilos.celda}>
            <Text style={estilos.etiqueta}>Score / Búsquedas Google</Text>
            <Text style={estilos.valor}>
              {m.calculatedScore}/100 · {m.googleSearchVolume.toLocaleString("es-ES")}
            </Text>
          </View>
          <View style={estilos.celda}>
            <Text style={estilos.etiqueta}>Procedencia</Text>
            <View style={[estilos.insignia, { backgroundColor: `${COLOR_TIPO[m.tipoDato]}22`, maxWidth: 90 }]}>
              <Text style={{ color: COLOR_TIPO[m.tipoDato], fontSize: 7, fontWeight: "bold" }}>
                {m.tipoDato} · {m.fuente}
              </Text>
            </View>
            <Text style={estilos.etiqueta}>
              {new Date(m.fechaMedicion).toLocaleDateString("es-ES")}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Marca de agua del plan. */
function MarcaDeAgua({ plan }: { plan: PlanType }) {
  return (
    <View style={estilos.marcaAgua} fixed>
      <Text style={estilos.marcaAguaTexto}>{plan}</Text>
    </View>
  );
}

/** Documento base con cabecera, marca de agua y pie. */
function DocumentoBase({ plan, titulo, subtitulo, children }: {
  plan: PlanType;
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <Document>
      <Page size="A4" style={estilos.pagina}>
        <MarcaDeAgua plan={plan} />
        <View style={estilos.cabecera}>
          <View>
            <Text style={estilos.titulo}>{titulo}</Text>
            <Text style={estilos.subtitulo}>{subtitulo}</Text>
          </View>
          <View style={{ textAlign: "right" as const }}>
            <Text style={{ fontSize: 9, color: "#6366f1", fontWeight: "bold" }}>TrendHunter Pro</Text>
            <Text style={estilos.etiqueta}>Generado {new Date().toLocaleDateString("es-ES")}</Text>
            <Text style={estilos.etiqueta}>Plan: {plan}</Text>
          </View>
        </View>
        {children}
        <Text style={estilos.pie}>
          Cada cifra incluye su fuente, fecha de medición y tipo de dato.
          Generado por TrendHunter Pro · investigación de productos y tendencias.
        </Text>
      </Page>
    </Document>
  );
}

/** Informe PDF de un producto. */
export function DocumentoProducto({ producto, metricas, plan }: {
  producto: ProductDTO;
  metricas: TrendMetricDTO[];
  plan: PlanType;
}) {
  return (
    <DocumentoBase plan={plan} titulo={producto.title} subtitulo={`Informe de producto · ${producto.category} · ${producto.nicheTag}`}>
      <Text style={estilos.seccion}>Resumen</Text>
      <View style={estilos.fila}>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>TrendScore</Text>
          <Text style={estilos.valor}>{producto.trendScore}/100</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Dirección</Text>
          <Text style={estilos.valor}>{producto.trendDirection}</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Oportunidad dorada</Text>
          <Text style={estilos.valor}>{producto.isGoldenOpportunity ? "Sí" : "No"}</Text>
        </View>
      </View>

      {/* Confianza del dato: lo primero que debe ver quien lee el informe. */}
      <View
        style={[
          estilos.insignia,
          {
            backgroundColor: `${COLOR_CONFIANZA[producto.nivelConfianza] ?? "#64748b"}22`,
            maxWidth: "100%",
            marginBottom: 8,
          },
        ]}
      >
        <Text style={{ color: COLOR_CONFIANZA[producto.nivelConfianza] ?? "#64748b", fontSize: 8, fontWeight: "bold" }}>
          Confianza del dato: {producto.nivelConfianza} · {producto.confianza}/100 ·{" "}
          {producto.fuentesMedidas} fuente(s) medida(s)
        </Text>
      </View>
      <Text style={[estilos.etiqueta, { marginBottom: 10 }]}>
        {producto.nivelConfianza === "VERIFICADO"
          ? "Dos o más fuentes independientes medidas en los últimos 7 días."
          : "Cifras del motor interno sin confirmación externa suficiente: trátalas como una hipótesis, no como una medición."}
      </Text>
      <View style={estilos.fila}>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Precio de coste</Text>
          <Text style={estilos.valor}>{producto.costPrice.toFixed(2)} €</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Precio sugerido</Text>
          <Text style={estilos.valor}>{producto.suggestedSellPrice.toFixed(2)} €</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Margen estimado</Text>
          <Text style={estilos.valor}>{producto.estimatedMargin.toFixed(1)} %</Text>
        </View>
      </View>

      <Text style={estilos.seccion}>Señales de demanda (con procedencia)</Text>
      <TablaMetricas metricas={metricas} />
    </DocumentoBase>
  );
}

/** Informe PDF de una tienda. */
export function DocumentoTienda({ tienda, plan }: { tienda: StoreDTO; plan: PlanType }) {
  return (
    <DocumentoBase plan={plan} titulo={tienda.name} subtitulo={`Informe de tienda · ${tienda.domain} · ${tienda.niche}`}>
      <Text style={estilos.seccion}>Resumen</Text>
      <View style={estilos.fila}>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Ingresos estimados/mes</Text>
          <Text style={estilos.valor}>{tienda.estimatedMonthlyRevenue.toLocaleString("es-ES")} €</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Visitas estimadas/mes</Text>
          <Text style={estilos.valor}>{tienda.estimatedTraffic.toLocaleString("es-ES")}</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Productos</Text>
          <Text style={estilos.valor}>{tienda.productsCount}</Text>
        </View>
      </View>
      <View style={estilos.fila}>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Valor medio del pedido</Text>
          <Text style={estilos.valor}>{tienda.avgOrderValue.toFixed(2)} €</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Conversión estimada</Text>
          <Text style={estilos.valor}>{tienda.conversionRate.toFixed(2)} %</Text>
        </View>
        <View style={estilos.celda}>
          <Text style={estilos.etiqueta}>Shopify detectado</Text>
          <Text style={estilos.valor}>{tienda.shopifyDetected ? "Sí" : "No"}</Text>
        </View>
      </View>

      <Text style={estilos.seccion}>Productos destacados</Text>
      {tienda.topProducts.slice(0, 10).map((producto) => (
        <View key={producto.title} style={estilos.fila}>
          <View style={estilos.celda}>
            <Text style={estilos.valor}>{producto.title}</Text>
          </View>
          <View style={estilos.celda}>
            <Text style={estilos.valor}>{Number(producto.price).toFixed(2)} €</Text>
          </View>
          <View style={estilos.celda}>
            <Text style={estilos.etiqueta}>Unidades estimadas</Text>
            <Text style={estilos.valor}>{producto.estimatedUnitsSold}</Text>
          </View>
        </View>
      ))}
    </DocumentoBase>
  );
}
