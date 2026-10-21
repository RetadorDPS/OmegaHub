/**
 * Tipos y uniones del dominio compartidos por toda la aplicación.
 * Reflejan los enums de `prisma/schema.prisma` (SQLite los almacena como TEXT,
 * PostgreSQL usa tipos ENUM nativos; en TypeScript se modelan como uniones).
 */

// ---------------------------------------------------------------------------
//  Enumeraciones del dominio
// ---------------------------------------------------------------------------

export type Role = "USER" | "ADMIN";
export type PlanType = "FREE" | "PRO" | "BUSINESS" | "AGENCY";
export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
export type TeamMemberStatus = "INVITED" | "ACTIVE" | "REVOKED";
export type WebhookProvider = "SLACK" | "DISCORD" | "GENERIC";
export type SaturationLevel = "LOW" | "MEDIUM" | "HIGH";
export type AdPlatform = "FACEBOOK" | "TIKTOK" | "INSTAGRAM";
export type TrendDirection = "RISING" | "STABLE" | "FALLING";
export type ProductStatus = "ACTIVE" | "PENDING" | "ARCHIVED";
export type ScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type ScanEngine = "PLAYWRIGHT" | "SIMULATED";
export type NotificationType =
  | "NEW_PRODUCT"
  | "TREND_ALERT"
  | "STORE_CHANGE"
  | "PRICE_CHANGE"
  | "SYSTEM"
  | "SUBSCRIPTION"
  | "SCORE_THRESHOLD"
  | "SATURATION_ALERT"
  | "TREND_REVERSAL";
/** Nivel de confianza del dato de un producto. */
export type NivelConfianza = "VERIFICADO" | "PARCIAL" | "ESTIMADO" | "SIN_DATOS";

export type StoreChangeType =
  | "NEW_PRODUCT"
  | "PRICE_CHANGE"
  | "SOLD_OUT"
  | "THEME_CHANGE"
  | "TRAFFIC_SPIKE"
  | "REVENUE_MILESTONE";
export type AiToolType = "AD_COPY" | "VIDEO_SCRIPT" | "BUYER_PERSONA" | "STORE_NAMES" | "PRODUCT_ANALYSIS";
export type AiProvider = "OPENAI" | "GEMINI" | "SIMULATED";
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
export type SupplierPlatform =
  | "ALIEXPRESS"
  | "CJ_DROPSHIPPING"
  | "ALIBABA"
  | "AMAZON"
  | "SPOCKET"
  | "ZENDROP";
export type UsageAction = "PRODUCT_VIEW" | "AI_GENERATION" | "STORE_SCAN" | "EXPORT";

// ---------------------------------------------------------------------------
//  Etiquetas y colores por defecto para la interfaz
// ---------------------------------------------------------------------------

export const PLAN_LABELS: Record<PlanType, string> = {
  FREE: "Free",
  PRO: "Pro",
  BUSINESS: "Business",
  AGENCY: "Agency",
};

export const SATURATION_LABELS: Record<SaturationLevel, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  NEW_PRODUCT: "Producto nuevo",
  TREND_ALERT: "Alerta de tendencia",
  STORE_CHANGE: "Cambio en tienda",
  PRICE_CHANGE: "Cambio de precio",
  SYSTEM: "Sistema",
  SUBSCRIPTION: "Suscripción",
  SCORE_THRESHOLD: "Score objetivo",
  SATURATION_ALERT: "Mercado saturado",
  TREND_REVERSAL: "Reversión de tendencia",
};

export const TREND_DIRECTION_LABELS: Record<TrendDirection, string> = {
  RISING: "En ascenso",
  STABLE: "Estable",
  FALLING: "En descenso",
};

// ---------------------------------------------------------------------------
//  DTOs que viajan del servidor al cliente
// ---------------------------------------------------------------------------

/** Producto serializado para la interfaz (fechas como ISO string). */
export interface ProductDTO {
  id: string;
  title: string;
  slug: string;
  description: string;
  mainImage: string;
  images: string[];
  category: string;
  nicheTag: string;
  tags: string[];
  costPrice: number;
  suggestedSellPrice: number;
  estimatedMargin: number;
  aliExpressUrl: string | null;
  amazonUrl: string | null;
  cjUrl: string | null;
  supplierName: string | null;
  trendScore: number;
  velocityScore: number;
  saturationLevel: SaturationLevel;
  trendDirection: TrendDirection;
  isGoldenOpportunity: boolean;
  /** Confianza del dato (0–100) y su nivel. */
  confianza: number;
  nivelConfianza: NivelConfianza;
  fuentesMedidas: number;
  ultimaMedicion: string | null;
  googleSearchVolume: number;
  youtubeViews: number;
  tiktokViews: number;
  metaAdsCount: number;
  storesUsing: number;
  estimatedMonthlyRevenue: number;
  estimatedUnitsSold: number;
  status: ProductStatus;
  countryAvailability: string[];
  createdAt: string;
  updatedAt: string;
}

/** Métrica diaria serializada (gráficas de detalle). */
/** Procedencia de una cifra: cómo llegó a la base de datos. */
export type TipoDato = "MEDIDO" | "IMPORTADO" | "ESTIMADO" | "MIXTO";

export interface TrendMetricDTO {
  date: string;
  googleSearchVolume: number;
  tiktokViews: number;
  youtubeViews: number;
  metaAdsCount: number;
  shopifyStoresUsing: number;
  calculatedScore: number;
  /// Procedencia de la cifra (dato real, no excusa):
  fuente: string;
  fechaMedicion: string;
  tipoDato: TipoDato;
}

/** Anuncio serializado para Ads Spy. */
export interface AdDTO {
  id: string;
  platform: AdPlatform;
  productId: string | null;
  productTitle?: string | null;
  mediaUrl: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  headline: string;
  body: string;
  callToAction: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  daysActive: number;
  countryTargets: string[];
  nicheTag: string;
  advertiserName: string;
  adLibraryUrl: string | null;
  engagementRate: number;
  isActive: boolean;
  firstSeenAt: string;
}

/** Tienda serializada para Shop Analyzer / Store Tracker. */
export interface StoreDTO {
  id: string;
  shopifyUrl: string;
  name: string;
  domain: string;
  niche: string;
  country: string;
  shopifyDetected: boolean;
  themeName: string | null;
  estimatedMonthlyRevenue: number;
  estimatedTraffic: number;
  monthlyVisits: number;
  avgOrderValue: number;
  conversionRate: number;
  productsCount: number;
  categories: string[];
  appsDetected: string[];
  growthRate: number;
  lastScannedAt: string | null;
  topProducts: StoreProductDTO[];
}

export interface StoreProductDTO {
  title: string;
  image?: string | null;
  price: number;
  comparePrice?: number | null;
  salesRank: number;
  estimatedUnitsSold: number;
  productUrl?: string | null;
}

/** Resultado del análisis de una tienda (Shop Analyzer). */
export interface StoreAnalysisResult {
  store: StoreDTO;
  detected: {
    shopify: boolean;
    theme: string | null;
    apps: string[];
    currency: string;
    productCount: number;
  };
  metrics: {
    estimatedMonthlyRevenue: number;
    estimatedMonthlyVisits: number;
    avgOrderValue: number;
    conversionRate: number;
    revenuePerVisitor: number;
  };
  categories: Array<{ name: string; share: number }>;
  topProducts: StoreProductDTO[];
  competitors: Array<{ name: string; domain: string; estimatedRevenue: number }>;
  warnings: string[];
  engine: ScanEngine;
  durationMs: number;
}

/** Notificación serializada para la campana del header. */
export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
}

/** Evento del timeline de una tienda monitorizada. */
export interface StoreChangeDTO {
  id: string;
  storeId: string;
  storeName?: string;
  type: StoreChangeType;
  title: string;
  description: string;
  productTitle: string | null;
  imageUrl: string | null;
  priceBefore: number | null;
  priceAfter: number | null;
  impactScore: number;
  detectedAt: string;
}

/** Resumen de plan/uso del usuario para el middleware de límites. */
export interface PlanUsageSummary {
  plan: PlanType;
  productViews: { used: number; limit: number | null };
  aiGenerations: { used: number; limit: number | null };
  storeScans: { used: number; limit: number | null };
}

/** Filtros del catálogo de productos (estado en la URL). */
export interface ProductFilters {
  search?: string;
  category?: string;
  niche?: string;
  saturation?: SaturationLevel | "ALL";
  minScore?: number;
  minMargin?: number;
  maxPrice?: number;
  minPrice?: number;
  goldenOnly?: boolean;
  /** Solo productos con dos o más fuentes medidas en los últimos 7 días. */
  verificadosOnly?: boolean;
  sort?: ProductSortOption;
  page?: number;
  pageSize?: number;
}

export type ProductSortOption =
  | "recent"
  | "best-score"
  | "highest-margin"
  | "least-saturated"
  | "highest-revenue"
  | "fastest-rising";

/** Filtros de la biblioteca de anuncios. */
export interface AdFilters {
  platform?: AdPlatform | "ALL";
  niche?: string;
  country?: string;
  minEngagement?: number;
  minDaysActive?: number;
  search?: string;
  sort?: "recent" | "engagement" | "longest-running" | "most-liked";
}

/** Resultado paginado genérico. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
//  Salidas del AI Studio
// ---------------------------------------------------------------------------

export interface AdCopyVariant {
  id: string;
  angle: string;
  hook: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface VideoScriptScene {
  timecode: string;
  visual: string;
  voiceover: string;
  onScreenText: string;
  sound: string;
}

export interface VideoScript {
  duration: 15 | 30 | 60;
  platform: AdPlatform;
  concept: string;
  hook: string;
  scenes: VideoScriptScene[];
  cta: string;
  hashtags: string[];
}

export interface BuyerPersona {
  name: string;
  ageRange: string;
  gender: string;
  location: string;
  income: string;
  occupation: string;
  painPoints: string[];
  desires: string[];
  objections: string[];
  buyingTriggers: string[];
  channels: string[];
  quote: string;
}

export interface StoreNameIdea {
  name: string;
  domain: string;
  rationale: string;
  available?: boolean;
}


/** Cliente de una agencia (modo agencia, plan BUSINESS+). */
export interface ClienteDTO {
  id: string;
  nombre: string;
  dominio: string | null;
  notas: string | null;
  createdAt: string;
  productosSeguidos: number;
  tiendasSeguidas: number;
}
