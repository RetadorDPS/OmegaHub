/**
 * ============================================================================
 *  SEED DE TRENDHUNTER PRO
 * ============================================================================
 *  Rellena la base de datos con un dataset completo y coherente:
 *
 *   · 9 usuarios (admin, demo de pago y plan free) con contraseñas hasheadas.
 *   · 20 productos ganadores + 600 métricas diarias (30 días por producto).
 *   · 30 anuncios de Facebook, TikTok e Instagram.
 *   · 10 tiendas Shopify con sus productos y 40 eventos de timeline.
 *   · 12 proveedores, trackers, guardados, notificaciones y generaciones de IA.
 *
 *  Los scores NO se escriben a mano: los calcula el motor de tendencias
 *  (src/lib/trendEngine.ts), la misma lógica que usa la aplicación.
 * ============================================================================
 */

import { hash } from "bcryptjs";
import { toJsonInput } from "@/lib/json";
import prisma from "@/lib/prisma";
import { recalcularTodasLasConfianzas } from "@/lib/confianzaProducto";
import {
  calculateEngagementRate,
  calculateMarginPercent,
  calculateTrendDirection,
  calculateTrendScore,
  calculateVelocityFromMetrics,
  detectGoldenOpportunity,
  determineSaturationLevel,
  generateMetricSeries,
} from "@/lib/trendEngine";
import { SEED_PRODUCTS, imagenesProducto } from "./data/products";
import { SEED_STORES } from "./data/stores";
import { SEED_ADS, SAMPLE_VIDEOS } from "./data/ads";
import { SEED_SUPPLIERS } from "./data/suppliers";

const DIAS_HISTORICO = 30;

/** Elimina los datos existentes en orden seguro para las claves foráneas. */
async function limpiarBaseDeDatos(): Promise<void> {
  await prisma.trendMetric.deleteMany();
  await prisma.storeChange.deleteMany();
  await prisma.storeProduct.deleteMany();
  await prisma.storeScan.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.savedProduct.deleteMany();
  await prisma.trackedStore.deleteMany();
  await prisma.trackedProduct.deleteMany();
  await prisma.alertNotification.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.store.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
}

async function crearUsuarios() {
  const [adminPass, demoPass, freePass] = await Promise.all([
    hash("admin1234", 10),
    hash("demo1234", 10),
    hash("free1234", 10),
  ]);

  const admin = await prisma.user.create({
    data: {
      email: "admin@trendhunter.pro",
      name: "Ariadna Ruiz",
      passwordHash: adminPass,
      role: "ADMIN",
      planType: "BUSINESS",
      emailVerified: new Date(),
      quotaDayKey: hoy(),
      image: null,
      stripeCustomerId: "cus_demo_admin",
      stripeSubscriptionId: "sub_demo_admin",
      planRenewsAt: enD30Dias(),
    },
  });

  const demo = await prisma.user.create({
    data: {
      email: "demo@trendhunter.pro",
      name: "Daniel Ortega",
      passwordHash: demoPass,
      role: "USER",
      planType: "PRO",
      emailVerified: new Date(),
      quotaDayKey: hoy(),
      quotaUsedToday: 4,
      stripeCustomerId: "cus_demo_pro",
      stripeSubscriptionId: "sub_demo_pro",
      stripePriceId: process.env.STRIPE_PRICE_PRO ?? "price_demo_pro",
      planRenewsAt: enD30Dias(),
      lastLoginAt: haceHoras(3),
    },
  });

  const free = await prisma.user.create({
    data: {
      email: "free@trendhunter.pro",
      name: "Sofía Ledesma",
      passwordHash: freePass,
      role: "USER",
      planType: "FREE",
      emailVerified: new Date(),
      quotaDayKey: hoy(),
      lastLoginAt: haceHoras(30),
    },
  });

  // Usuarios adicionales para que el panel de administración tenga volumen real.
  const nombresExtra = [
    "Marc Vidal", "Laura Peña", "Iván Castaño", "Nerea Solís",
    "Tomás Guerra", "Paula Ferrán",
  ];
  const planes = ["FREE", "PRO", "FREE", "PRO", "BUSINESS", "FREE"] as const;
  const extras = await Promise.all(
    nombresExtra.map((nombre, indice) =>
      prisma.user.create({
        data: {
          email: `${nombre.split(" ")[0].toLowerCase()}${indice}@ejemplo.com`,
          name: nombre,
          passwordHash: freePass,
          planType: planes[indice],
          emailVerified: new Date(),
          createdAt: haceDias(20 - indice * 3),
          lastLoginAt: haceHoras(indice * 7 + 2),
        },
      }),
    ),
  );

  // Suscripciones sincronizadas (lo que habría creado el webhook de Stripe).
  await prisma.subscription.createMany({
    data: [
      {
        userId: admin.id, stripeCustomerId: "cus_demo_admin", stripeSubscriptionId: "sub_demo_admin",
        stripePriceId: process.env.STRIPE_PRICE_BUSINESS ?? "price_demo_business", planType: "BUSINESS",
        status: "ACTIVE", currentPeriodEnd: enD30Dias(),
      },
      {
        userId: demo.id, stripeCustomerId: "cus_demo_pro", stripeSubscriptionId: "sub_demo_pro",
        stripePriceId: process.env.STRIPE_PRICE_PRO ?? "price_demo_pro", planType: "PRO",
        status: "ACTIVE", currentPeriodEnd: enD30Dias(),
      },
    ],
  });

  return { admin, demo, free, extras };
}

async function crearCatalogo() {
  const productosCreados = [];

  for (const [indice, semilla] of SEED_PRODUCTS.entries()) {
    const imagenes = imagenesProducto(semilla.code);

    // 1) Serie histórica de 30 días generada de forma determinista.
    const serie = generateMetricSeries(
      semilla.metrics,
      DIAS_HISTORICO,
      indice + 7,
      semilla.growthBias,
    );
    // El último punto refleja exactamente las métricas declaradas del producto.
    const hoyFecha = new Date();
    hoyFecha.setHours(0, 0, 0, 0);
    serie[serie.length - 1] = { ...semilla.metrics, date: hoyFecha, calculatedScore: calculateTrendScore(semilla.metrics) };

    const scores = serie.map((punto) => punto.calculatedScore);
    const trendScore = calculateTrendScore(semilla.metrics);
    // La velocidad se mide sobre las métricas (sin saturar), no sobre el score.
    const velocityScore = calculateVelocityFromMetrics(serie);
    const trendDirection = calculateTrendDirection(scores);
    const saturationLevel = determineSaturationLevel(semilla.metrics.shopifyStoresUsing, semilla.metrics.googleSearchVolume);
    const estimatedMargin = calculateMarginPercent(semilla.costPrice, semilla.suggestedSellPrice);
    const isGolden = detectGoldenOpportunity({ trendScore, saturationLevel, velocityScore });

    const producto = await prisma.product.create({
      data: {
        title: semilla.title,
        slug: `${semilla.code}-${semilla.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60)}`,
        description: semilla.description,
        mainImage: imagenes[0],
        images: imagenes,
        category: semilla.category,
        nicheTag: semilla.nicheTag,
        tags: semilla.tags,
        costPrice: semilla.costPrice,
        suggestedSellPrice: semilla.suggestedSellPrice,
        estimatedMargin,
        aliExpressUrl: semilla.supplier.aliExpress ?? null,
        amazonUrl: semilla.supplier.amazon ?? null,
        cjUrl: semilla.supplier.cj ?? null,
        supplierName: semilla.supplier.name,
        trendScore,
        velocityScore,
        saturationLevel,
        trendDirection,
        isGoldenOpportunity: isGolden,
        googleSearchVolume: semilla.metrics.googleSearchVolume,
        tiktokViews: semilla.metrics.tiktokViews,
        metaAdsCount: semilla.metrics.metaAdsCount,
        storesUsing: semilla.metrics.shopifyStoresUsing,
        estimatedMonthlyRevenue: semilla.estimatedMonthlyRevenue,
        estimatedUnitsSold: semilla.estimatedUnitsSold,
        status: "ACTIVE",
        source: "seed",
        countryAvailability: semilla.countries,
        createdAt: haceDias(28 - indice),
      },
    });

    // 2) Métricas diarias (una fila por día).
    await prisma.trendMetric.createMany({
      data: serie.map((punto) => ({
        productId: producto.id,
        date: punto.date,
        googleSearchVolume: punto.googleSearchVolume,
        tiktokViews: punto.tiktokViews,
        metaAdsCount: punto.metaAdsCount,
        shopifyStoresUsing: punto.shopifyStoresUsing,
        calculatedScore: punto.calculatedScore,
        breakdown: { fuente: "seed", generado: true },
        // Catálogo de demostración: ninguna cifra viene de una API externa.
        // Se guarda la procedencia por fuente para que la interfaz no mezcle
        // datos estimados con datos medidos.
        fuente: "seed-demo",
        fechaMedicion: punto.date,
        tipoDato: "ESTIMADO",
        procedencia: toJsonInput({
          google: { tipo: "ESTIMADO", fuente: "seed-demo", fecha: punto.date.toISOString(), valor: punto.googleSearchVolume },
          tiktok: { tipo: "ESTIMADO", fuente: "seed-demo", fecha: punto.date.toISOString(), valor: punto.tiktokViews },
          meta: { tipo: "ESTIMADO", fuente: "seed-demo", fecha: punto.date.toISOString(), valor: punto.metaAdsCount },
          tiendas: { tipo: "ESTIMADO", fuente: "seed-demo", fecha: punto.date.toISOString(), valor: punto.shopifyStoresUsing },
        }),
      })),
    });

    productosCreados.push({ producto, semilla });
  }

  return productosCreados;
}

async function crearTiendas(productos: Awaited<ReturnType<typeof crearCatalogo>>) {
  const tiendasCreadas = [];

  for (const [indice, semilla] of SEED_STORES.entries()) {
    const tienda = await prisma.store.create({
      data: {
        shopifyUrl: semilla.shopifyUrl,
        name: semilla.name,
        domain: semilla.domain,
        niche: semilla.niche,
        country: semilla.country,
        shopifyDetected: true,
        themeName: semilla.themeName,
        estimatedMonthlyRevenue: semilla.estimatedMonthlyRevenue,
        estimatedTraffic: semilla.monthlyVisits,
        monthlyVisits: semilla.monthlyVisits,
        avgOrderValue: semilla.avgOrderValue,
        conversionRate: semilla.conversionRate,
        productsCount: semilla.productsCount,
        topProducts: toJsonInput(semilla.topProducts) as never,
        categories: semilla.categories,
        appsDetected: semilla.appsDetected,
        socialProfiles: semilla.socialProfiles,
        growthRate: semilla.growthRate,
        lastScannedAt: haceHoras(indice * 5 + 1),
        createdAt: haceDias(60 - indice * 4),
      },
    });

    // Productos concretos de la tienda, vinculados al catálogo cuando coincide.
    const filasProductos = semilla.topProducts.map((top) => {
      const coincidencia = productos.find(({ producto }) => producto.mainImage === top.image);
      return {
        storeId: tienda.id,
        productId: coincidencia?.producto.id ?? null,
        title: top.title,
        image: top.image,
        price: top.price,
        comparePrice: top.comparePrice ?? null,
        currency: "EUR",
        salesRank: top.salesRank,
        estimatedUnitsSold: top.estimatedUnitsSold,
        productUrl: `${semilla.shopifyUrl}/products/${top.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
        detectedAt: haceHoras(indice * 4 + 2),
      };
    });
    await prisma.storeProduct.createMany({ data: filasProductos });

    // Historial de precios de demo: 4 rondas de análisis
    // en las últimas 2 semanas con deriva realista
    // hasta el precio actual.
    const filasPrecio = semilla.topProducts.flatMap((top, i) =>
      [14, 9, 4, 0].map((dias, ronda) => ({
        storeId: tienda.id,
        title: top.title,
        price:
          ronda === 3
            ? top.price
            : Math.round(top.price * (1 + ((i + ronda) % 3 === 0 ? 0.06 : -0.03 - ronda * 0.02)) * 100) / 100,
        // Misma hora para todos los productos de una ronda: la gráfica
        // agrupa por día y así todas las series comparten el mismo eje.
        capturedAt: haceDias(dias),
      })),
    );
    await prisma.priceHistory.createMany({ data: filasPrecio });

    tiendasCreadas.push({ tienda, semilla });
  }

  return tiendasCreadas;
}

async function crearTimelineTiendas(tiendas: Awaited<ReturnType<typeof crearTiendas>>) {
  const plantillas = [
    { type: "NEW_PRODUCT" as const, titulo: "Nuevos productos publicados", descripcion: "La tienda ha lanzado {n} productos nuevos en las últimas 24 h, dos de ellos de la categoría {cat}.", impacto: 72 },
    { type: "PRICE_CHANGE" as const, titulo: "Cambio de precio detectado", descripcion: "Han bajado el precio de {prod} un {pct} % para atacar la competencia.", impacto: 64 },
    { type: "REVENUE_MILESTONE" as const, titulo: "Hito de facturación", descripcion: "La tienda supera los {amount} $ de facturación estimada este mes (+{pct} % intermensual).", impacto: 88 },
    { type: "TRAFFIC_SPIKE" as const, titulo: "Pico de tráfico", descripcion: "Detectamos un aumento del {pct} % en visitas, probablemente por una campaña activa en TikTok.", impacto: 76 },
    { type: "SOLD_OUT" as const, titulo: "Producto agotado", descripcion: "{prod} aparece como agotado: posible problema de stock en su proveedor.", impacto: 45 },
    { type: "THEME_CHANGE" as const, titulo: "Rediseño de la tienda", descripcion: "Han cambiado la plantilla a una versión más orientada a conversión móvil.", impacto: 38 },
  ];

  const eventos = [];
  for (const [indiceTienda, { tienda, semilla }] of tiendas.entries()) {
    const cantidadEventos = 4 + (indiceTienda % 3);
    for (let i = 0; i < cantidadEventos; i += 1) {
      const plantilla = plantillas[(indiceTienda + i) % plantillas.length];
      const top = semilla.topProducts[i % semilla.topProducts.length];
      const productoCatalogo = i % 3 === 0 ? top : null;
      const descripcion = plantilla.descripcion
        .replace("{n}", String(2 + (i % 4)))
        .replace("{cat}", semilla.categories[i % semilla.categories.length])
        .replace("{prod}", top.title)
        .replace("{pct}", String(12 + ((indiceTienda * 7 + i * 5) % 34)))
        .replace("{amount}", (semilla.estimatedMonthlyRevenue / 1000).toFixed(0));

      eventos.push({
        storeId: tienda.id,
        productId: null as string | null,
        type: plantilla.type,
        title: plantilla.titulo,
        description: descripcion,
        productTitle: productoCatalogo ? top.title : null,
        imageUrl: top.image,
        priceBefore: plantilla.type === "PRICE_CHANGE" ? Number((top.price * 1.25).toFixed(2)) : null,
        priceAfter: plantilla.type === "PRICE_CHANGE" ? top.price : null,
        impactScore: plantilla.impacto,
        detectedAt: haceHoras(indiceTienda * 6 + i * 3 + 1),
      });
    }
  }
  await prisma.storeChange.createMany({ data: eventos });
  return eventos.length;
}

async function crearAnuncios(productos: Awaited<ReturnType<typeof crearCatalogo>>) {
  const anuncios = SEED_ADS.map((semilla, indice) => {
    const encontrado = productos.find(({ semilla: p }) => p.code === semilla.productCode);
    const imagenPrincipal = encontrado?.producto.mainImage ?? "/images/products/p01-1.jpg";
    const alcance = semilla.views;
    return {
      platform: semilla.platform,
      productId: encontrado?.producto.id ?? null,
      mediaUrl: imagenPrincipal,
      thumbnailUrl: imagenPrincipal,
      videoUrl: SAMPLE_VIDEOS[indice % SAMPLE_VIDEOS.length],
      headline: semilla.headline,
      body: semilla.body,
      callToAction: semilla.callToAction,
      likes: semilla.likes,
      comments: semilla.comments,
      shares: semilla.shares,
      views: alcance,
      daysActive: semilla.daysActive,
      countryTargets: semilla.countryTargets,
      nicheTag: encontrado?.semilla.nicheTag ?? "General",
      advertiserName: semilla.advertiserName,
      adLibraryUrl: `https://www.facebook.com/ads/library/?q=${encodeURIComponent(semilla.advertiserName)}`,
      engagementRate: calculateEngagementRate(semilla.likes, semilla.comments, semilla.shares, alcance),
      isActive: semilla.daysActive < 60,
      firstSeenAt: haceDias(semilla.daysActive),
      lastSeenAt: haceHoras(indice % 20),
      createdAt: haceDias(semilla.daysActive),
    };
  });

  await prisma.ad.createMany({ data: anuncios });
  return anuncios.length;
}

async function crearProveedores() {
  await prisma.supplier.createMany({
    data: SEED_SUPPLIERS.map((proveedor, indice) => ({
      ...proveedor,
      categories: proveedor.categories,
      createdAt: haceDias(70 - indice * 3),
    })),
  });
  return SEED_SUPPLIERS.length;
}

async function crearActividadDeUsuario(
  usuarios: Awaited<ReturnType<typeof crearUsuarios>>,
  productos: Awaited<ReturnType<typeof crearCatalogo>>,
  tiendas: Awaited<ReturnType<typeof crearTiendas>>,
) {
  const { demo, admin } = usuarios;

  // Guardados de Daniel (plan Pro).
  const guardados = [
    { code: "p01", folder: "Ganadores Q1", notes: "Coste negociado a 11,80 $ con RelaxTech. Probar campaña con público 35-55.", priority: 3 },
    { code: "p06", folder: "Ganadores Q1", notes: "Vídeo viral: reutilizar hook de 3 segundos del anuncio de casa.comfort.", priority: 3 },
    { code: "p02", folder: "Alto ticket", notes: "Margen del 76 %. Buscar proveedor con etiquetado privado.", priority: 2 },
    { code: "p10", folder: "Alto ticket", notes: "Comparar con SmoothSkin: mejor certificado CE.", priority: 2 },
    { code: "p13", folder: "Test A/B", notes: "Testear ángulo familiar («regalo para tus padres»).", priority: 1 },
    { code: "p20", folder: "Test A/B", notes: "Público femenino 25-45, interés pilates y yoga.", priority: 1 },
    { code: "p18", folder: "Suscripción", notes: "Producto de recompra: montar plan mensual con Stripe.", priority: 2 },
    { code: "p07", folder: "Ganadores Q1", notes: "Buen margen, pero la competencia sube en Alemania.", priority: 2 },
  ];
  await prisma.savedProduct.createMany({
    data: guardados
      .map(({ code, folder, notes, priority }) => {
        const encontrado = productos.find(({ semilla }) => semilla.code === code);
        if (!encontrado) return null;
        return { userId: demo.id, productId: encontrado.producto.id, folder, notes, priority, createdAt: haceDias(12) };
      })
      .filter((fila): fila is NonNullable<typeof fila> => fila !== null),
  });

  // Tiendas monitorizadas por Daniel.
  const tiendasSeguidas = tiendas.slice(0, 4);
  await prisma.trackedStore.createMany({
    data: tiendasSeguidas.map(({ tienda }, indice) => ({
      userId: demo.id,
      storeId: tienda.id,
      notificationEnabled: indice !== 3,
      notes: indice === 0 ? "Competidor directo en salud y descanso." : null,
    })),
  });

  // Productos en seguimiento.
  await prisma.trackedProduct.createMany({
    data: ["p01", "p02", "p06", "p10", "p18", "p20"].map((code) => {
      const encontrado = productos.find(({ semilla }) => semilla.code === code)!;
      return {
        userId: demo.id,
        productId: encontrado.producto.id,
        notificationEnabled: true,
        targetTrendScore: 85,
        notes: null,
      };
    }),
  });

  // Notificaciones del usuario demo (campana del header).
  const notificaciones = [
    { type: "TREND_ALERT" as const, title: "Nuevo producto dorado detectado", message: "El proyector de galaxia con altavoz ha superado los 85 puntos con saturación baja.", entityType: "Product", entityId: productos[5].producto.id, actionUrl: `/dashboard/winning-products/${productos[5].producto.id}`, createdAt: haceHoras(1) },
    { type: "STORE_CHANGE" as const, title: "GlowLab Beauty lanzó 3 productos", message: "Tu tienda seguida publicó 3 novedades de skincare en las últimas 24 horas.", entityType: "Store", entityId: tiendas[1].tienda.id, actionUrl: "/dashboard/store-tracker", createdAt: haceHoras(2) },
    { type: "PRICE_CHANGE" as const, title: "Bajada de precio en Wisdom Sleep", message: "El masajeador cervical bajó un 18 % para atacar la competencia.", entityType: "Store", entityId: tiendas[0].tienda.id, actionUrl: "/dashboard/store-tracker", createdAt: haceHoras(5) },
    { type: "NEW_PRODUCT" as const, title: "12 productos nuevos esta semana", message: "Se han añadido 12 productos ganadores con score superior a 80.", entityType: "Product", entityId: null, actionUrl: "/dashboard/winning-products", createdAt: haceHoras(9) },
    { type: "SUBSCRIPTION" as const, title: "Suscripción Pro activa", message: "Tu plan Pro se renueva el próximo mes. Podrás seguir analizando tiendas sin límites diarios.", entityType: "User", entityId: demo.id, actionUrl: "/dashboard/settings/billing", createdAt: haceHoras(26), read: true },
    { type: "SYSTEM" as const, title: "Datos actualizados", message: "Sincronización completa con TikTok Creative Center, Meta Ad Library y Google Trends.", entityType: null, entityId: null, actionUrl: null, createdAt: haceHoras(30), read: true },
    { type: "TREND_ALERT" as const, title: "Magnesio glicinato sube al top 5", message: "La demanda de suplementos de magnesio creció un 34 % este mes.", entityType: "Product", entityId: productos[17].producto.id, actionUrl: `/dashboard/winning-products/${productos[17].producto.id}`, createdAt: haceHoras(34), read: true },
    { type: "STORE_CHANGE" as const, title: "Fit Revolution Pro alcanzó un hito", message: "Superó los 500.000 $ de facturación estimada este mes.", entityType: "Store", entityId: tiendas[5].tienda.id, actionUrl: "/dashboard/store-tracker", createdAt: haceHoras(48), read: true },
  ];
  await prisma.alertNotification.createMany({
    data: notificaciones.map((n) => ({
      ...n,
      userId: demo.id,
      read: n.read ?? false,
    })),
  });

  // Notificaciones del administrador.
  await prisma.alertNotification.createMany({
    data: [
      { userId: admin.id, type: "SYSTEM", title: "Nuevos usuarios registrados", message: "6 usuarios nuevos esta semana, 2 con plan Pro.", actionUrl: "/dashboard/admin", createdAt: haceHoras(4) },
      { userId: admin.id, type: "SYSTEM", title: "Scraping completado", message: "El scraping programado de 10 tiendas finalizó correctamente.", actionUrl: "/dashboard/admin", createdAt: haceHoras(11) },
      { userId: admin.id, type: "SUBSCRIPTION", title: "Ingreso recurrente", message: "MRR estimado: 1.244 $ (4 suscripciones activas de pago).", actionUrl: "/dashboard/admin", createdAt: haceHoras(20), read: true },
    ],
  });

  // Generaciones de IA de ejemplo (historial del AI Studio).
  const generaciones = [
    {
      tool: "AD_COPY" as const, productIndex: 0,
      input: { producto: "Masajeador cervical eléctrico", tono: "emocional", plataforma: "FACEBOOK" },
      output: [
        { angle: "Dolor de cuello", hook: "Adiós al dolor de cuello en 15 minutos", primaryText: "Trabajo 10 horas al día frente al ordenador y probé de todo. Este masajeador combina calor, masaje y tracción.", headline: "Alivio real en 15 minutos", callToAction: "Comprar ahora" },
        { angle: "Regalo para padres", hook: "El regalo que tus padres usarán cada día", primaryText: "Pensado para quien pasa horas sentado. Calor infrarrojo y tracción cervical en una sola almohada.", headline: "Regalo útil de verdad", callToAction: "Enviar como regalo" },
      ],
    },
    {
      tool: "VIDEO_SCRIPT" as const, productIndex: 5,
      input: { producto: "Proyector de galaxia", duracion: 15, plataforma: "TIKTOK", estilo: "room-transformation" },
      output: {
        duration: 15, concept: "Transformación del dormitorio en 15 segundos",
        hook: "Mi cuarto por 44 € se ve así 👇",
        scenes: [
          { timecode: "0-3 s", visual: "Habitación a oscuras, proyector encendido de golpe", voiceover: "Esto cuesta menos que una cena.", onScreenText: "44 € y parece otro cuarto", sound: "Beat drop suave" },
          { timecode: "3-10 s", visual: "Barrido de la galaxia en el techo y las paredes", voiceover: "16 discos, nebulosa y altavoz Bluetooth integrado.", onScreenText: "16 discos HD + Bluetooth", sound: "Música lo-fi" },
          { timecode: "10-15 s", visual: "Primer plano del mando y del producto", voiceover: "Cambia la luz desde el sofá.", onScreenText: "Enlace en bio", sound: "Fade out" },
        ],
        cta: "Consigue el tuyo con envío gratis", hashtags: ["#galaxyprojector", "#roomdecor", "#tiktokmademebuyit"],
      },
    },
    {
      tool: "BUYER_PERSONA" as const, productIndex: 1,
      input: { producto: "Máscara LED facial", pais: "ES", rangoEdad: "28-45" },
      output: {
        name: "Marta, la profesional ocupada", ageRange: "30-42", gender: "Femenino", location: "Madrid, Barcelona, Valencia",
        income: "2.400-3.200 €/mes", occupation: "Marketing digital",
        painPoints: ["No tiene tiempo para ir a un centro estético", "Primeras arrugas y manchas tras el verano", "Rutina de skincare sin resultados visibles"],
        desires: ["Verse descansada en vídeo-llamadas", "Cuidarse en casa sin gastar 180 €/mes", "Resultados rápidos y medibles"],
        objections: ["¿De verdad funciona o es marketing?", "¿Puede dañar mi piel sensible?", "¿Cuánto tarda en verse el resultado?"],
        buyingTriggers: ["Comparativa con centros de estética", "Testimonio en vídeo de 4 semanas", "Garantía de devolución de 30 días"],
        channels: ["Instagram Reels", "TikTok", "Newsletter de belleza"],
        quote: "Si me ahorra un tratamiento al mes y funciona, lo compro hoy.",
      },
    },
    {
      tool: "STORE_NAMES" as const, productIndex: 0,
      input: { nicho: "salud y descanso", estilo: "premium", idioma: "es" },
      output: [
        { name: "LumbarCare", domain: "lumbarcare.es", rationale: "Directo, memorable y con dominio .es disponible." },
        { name: "CervicalHome", domain: "cervicalhome.com", rationale: "Enfatiza el uso doméstico y el nicho concreto." },
        { name: "Releva", domain: "releva.es", rationale: "Nombre corto y pronunciable con aire de marca de bienestar." },
        { name: "DescansoPro", domain: "descansopro.es", rationale: "Público español, transmite profesionalidad y descanso." },
      ],
    },
    {
      tool: "PRODUCT_ANALYSIS" as const, productIndex: 9,
      input: { producto: "Depiladora IPL", enfoque: "márgenes y competencia" },
      output: {
        resumen: "Producto de alto ticket con margen bruto del 75 % y demanda estable todo el año, con picos en primavera.",
        fortalezas: ["Margen por unidad superior a 65 $", "Demostración visual sencilla (antes/después)", "Recompra de recambios y filtros"],
        riesgos: ["Competencia alta en marketplaces", "Requiere explicar seguridad y certificados", "Devoluciones por expectativas mal ajustadas"],
        recomendacion: "Entrar con vídeo UGC de 4 semanas de progreso y garantía de devolución; posicionar en 89,99 $.",
      },
    },
  ];

  await prisma.aiGeneration.createMany({
    data: generaciones.map((generacion, indice) => {
      const producto = productos[generacion.productIndex].producto;
      return {
        userId: demo.id,
        productId: producto.id,
        tool: generacion.tool,
        provider: "SIMULATED" as const,
        model: "plantilla-interna-v1",
        input: generacion.input,
        output: generacion.output,
        promptUsed: `Genera contenido de tipo ${generacion.tool} para el producto ${producto.title}`,
        tokensUsed: 420 + indice * 130,
        latencyMs: 380 + indice * 95,
        isFavorite: indice < 2,
        createdAt: haceHoras(6 + indice * 9),
      };
    }),
  });

  // Consumo de cuota (límites por plan) de los últimos 7 días.
  const eventosUso = [];
  for (let dia = 6; dia >= 0; dia -= 1) {
    const cantidad = 3 + ((dia * 5) % 9);
    for (let i = 0; i < cantidad; i += 1) {
      eventosUso.push({
        userId: demo.id,
        action: i % 5 === 0 ? ("AI_GENERATION" as const) : ("PRODUCT_VIEW" as const),
        quantity: 1,
        dayKey: new Date(Date.now() - dia * 86_400_000).toISOString().slice(0, 10),
        createdAt: new Date(Date.now() - dia * 86_400_000 - i * 60_000),
      });
    }
  }
  eventosUso.push({
    userId: usuarios.free.id, action: "PRODUCT_VIEW" as const, quantity: 9, dayKey: hoy(),
    createdAt: haceHoras(2),
  });
  await prisma.usageEvent.createMany({ data: eventosUso });

  // Análisis de tienda ya ejecutado (historial del Shop Analyzer).
  await prisma.storeScan.createMany({
    data: [
      {
        storeId: tiendas[0].tienda.id, userId: demo.id, url: "https://wisdomsleep.es", normalizedUrl: "https://wisdomsleep.es",
        status: "COMPLETED", engine: "SIMULATED", progress: 100, durationMs: 4_820,
        result: { fuente: "seed", tienda: "Wisdom Sleep", productosDetectados: 34 },
        createdAt: haceHoras(6), startedAt: haceHoras(6), finishedAt: haceHoras(6),
      },
      {
        storeId: tiendas[1].tienda.id, userId: demo.id, url: "https://glowlabbeauty.com", normalizedUrl: "https://glowlabbeauty.com",
        status: "COMPLETED", engine: "SIMULATED", progress: 100, durationMs: 5_140,
        result: { fuente: "seed", tienda: "GlowLab Beauty", productosDetectados: 58 },
        createdAt: haceHoras(27), startedAt: haceHoras(27), finishedAt: haceHoras(27),
      },
    ],
  });

  return { notificaciones: notificaciones.length + 3, generaciones: generaciones.length };
}

/**
 * Equipo y webhooks de demostración.
 *
 * El equipo lo tiene el administrador (plan Business): aparece con una plaza
 * ocupada y una invitación pendiente, para que se vea cómo funciona sin
 * inventar miembros que no existen.
 */
async function crearEquipoYWebhooks(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { email: true, name: true } });
  if (!admin) return { miembros: 0, webhooks: 0 };

  const equipo = await prisma.team.create({
    data: {
      name: "Agencia Norte",
      ownerId: adminId,
      seats: 5,
      members: {
        create: [
          { userId: adminId, email: admin.email, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
          {
            email: "companero@trendhunter.pro",
            role: "MEMBER",
            status: "INVITED",
            inviteToken: "demo-invitacion-equipo-trendhunter-2026",
          },
        ],
      },
    },
  });

  await prisma.webhook.create({
    data: {
      userId: adminId,
      nombre: "Alertas del equipo (Slack)",
      url: "https://hooks.slack.com/services/T00000000/B00000000/demoNoReal0000000000000000",
      provider: "SLACK",
      eventos: ["alerta", "producto", "precio"],
      activo: false,
      ultimoError: "Webhook de demostración: sustitúyelo por el tuyo.",
    },
  });

  const miembros = await prisma.teamMember.count({ where: { teamId: equipo.id } });
  return { miembros, webhooks: 1 };
}

async function notificarResumen(usuarios: number, productos: number, tiendas: number, anuncios: number, proveedores: number) {
  const totalMetricas = await prisma.trendMetric.count();
  const totalEventos = await prisma.storeChange.count();
  const dorados = await prisma.product.count({ where: { isGoldenOpportunity: true } });
  console.log("\n✔ SEED COMPLETADO");
  console.log(`   Usuarios:        ${usuarios}`);
  console.log(`   Productos:       ${productos}  (${dorados} oportunidades doradas)`);
  console.log(`   Métricas diarias:${totalMetricas}`);
  console.log(`   Anuncios:        ${anuncios}`);
  console.log(`   Tiendas:         ${tiendas}  (${totalEventos} eventos de timeline)`);
  console.log(`   Proveedores:     ${proveedores}`);
  console.log("\n   Cuentas de acceso:");
  console.log("   · admin@trendhunter.pro / admin1234   (ADMIN · BUSINESS)");
  console.log("   · demo@trendhunter.pro  / demo1234    (USER · PRO)");
  console.log("   · free@trendhunter.pro  / free1234    (USER · FREE)\n");
}

// ---------------------------------------------------------------------------
//  Utilidades de fechas
// ---------------------------------------------------------------------------

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}
function haceHoras(horas: number): Date {
  return new Date(Date.now() - horas * 3_600_000);
}
function haceDias(dias: number): Date {
  return new Date(Date.now() - dias * 86_400_000);
}
function enD30Dias(): Date {
  return new Date(Date.now() + 30 * 86_400_000);
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------

async function main() {
  console.log("🌱 Iniciando seed de TrendHunter Pro…");
  console.log(`   Base de datos: ${(process.env.DATABASE_URL ?? "file:./prisma/trendhunter.db").replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@")}`);

  await limpiarBaseDeDatos();
  const usuarios = await crearUsuarios();
  const productos = await crearCatalogo();

  // La confianza se calcula con la misma regla que en producción: el seed no
  // tiene fuentes medidas, así que todos quedan como ESTIMADO (y se dice).
  const confianzas = await recalcularTodasLasConfianzas();
  const estimados = confianzas.filter((fila) => fila.nivel === "ESTIMADO").length;
  console.log(`\n   Confianza calculada: ${confianzas.length} productos · ${estimados} estimados (seed sin fuentes externas).`);
  const tiendas = await crearTiendas(productos);
  const eventos = await crearTimelineTiendas(tiendas);
  const anuncios = await crearAnuncios(productos);
  const proveedores = await crearProveedores();
  await crearActividadDeUsuario(usuarios, productos, tiendas);
  const equipo = await crearEquipoYWebhooks(usuarios.admin.id);

  await notificarResumen(4 + usuarios.extras.length, productos.length, tiendas.length, anuncios, proveedores);
  console.log(`   Eventos de timeline: ${eventos}`);
  console.log(`   Equipo demo:     ${equipo.miembros} plazas (1 invitación pendiente) · ${equipo.webhooks} webhook`);
  console.log(`   Invitación demo: /equipos/aceptar?token=demo-invitacion-equipo-trendhunter-2026`);
}

main()
  .catch((error) => {
    console.error("✖ Error durante el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
