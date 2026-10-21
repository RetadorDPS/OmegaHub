/**
 * Constantes de producto: categorías, nichos, países, planes y navegación.
 * Fuente única de verdad para los filtros de la interfaz y la lógica de planes.
 */

import type { PlanType } from "@/types";

// ---------------------------------------------------------------------------
//  Catálogo
// ---------------------------------------------------------------------------

/** Categorías principales soportadas por el catálogo. */
export const PRODUCT_CATEGORIES = ["Salud", "Belleza", "Tecnología", "Mascotas", "Hogar", "Fitness"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Nichos concretos por categoría (usados por filtros y seeds). */
export const PRODUCT_NICHES: Record<ProductCategory, string[]> = {
  Salud: ["Suplementos", "Sueño y descanso", "Cuidado postural", "Salud respiratoria", "Bienestar digestivo"],
  Belleza: ["Cuidado facial", "Cabello", "Uñas y manos", "Depilación", "Perfumería viral"],
  Tecnología: ["Audio", "Gadgets para móvil", "Domótica", "Accesorios gaming", "Cámaras y seguridad"],
  Mascotas: ["Juguetes para perros", "Cuidado felino", "Higiene y peluquería", "Comederos inteligentes"],
  Hogar: ["Organización", "Cocina", "Iluminación", "Limpieza", "Decoración"],
  Fitness: ["Entrenamiento en casa", "Yoga y pilates", "Recuperación muscular", "Ropa deportiva"],
} as const;

/** Países objetivo disponibles en los filtros de anuncios. */
export const TARGET_COUNTRIES = [
  { code: "ES", name: "España", flag: "🇪🇸" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "MX", name: "México", flag: "🇲🇽" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "FR", name: "Francia", flag: "🇫🇷" },
  { code: "DE", name: "Alemania", flag: "🇩🇪" },
  { code: "IT", name: "Italia", flag: "🇮🇹" },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧" },
] as const;

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  TARGET_COUNTRIES.map((country) => [country.code, country.name]),
);

export const COUNTRY_FLAGS: Record<string, string> = Object.fromEntries(
  TARGET_COUNTRIES.map((country) => [country.code, country.flag]),
);

/** Opciones de ordenación del catálogo (etiqueta → valor de la URL). */
export const PRODUCT_SORT_OPTIONS = [
  { value: "recent", label: "Más recientes" },
  { value: "best-score", label: "Mejor TrendScore" },
  { value: "highest-margin", label: "Mayor margen" },
  { value: "least-saturated", label: "Menos saturados" },
  { value: "fastest-rising", label: "Mayor velocidad" },
  { value: "highest-revenue", label: "Mayor facturación" },
] as const;

// ---------------------------------------------------------------------------
//  Planes y límites
// ---------------------------------------------------------------------------

/** Límites diarios por plan. `null` significa ilimitado. */
export interface PlanLimits {
  productViews: number | null;
  aiGenerations: number | null;
  storeScans: number | null;
  savedProducts: number | null;
  trackedItems: number | null;
  exports: number | null;
  /** Personas que pueden usar la cuenta (1 = solo el titular). */
  seats: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    productViews: 10,
    aiGenerations: 3,
    storeScans: 1,
    savedProducts: 5,
    trackedItems: 2,
    exports: 0,
    seats: 1,
  },
  PRO: {
    productViews: null,
    aiGenerations: 100,
    storeScans: 10,
    savedProducts: 200,
    trackedItems: 50,
    exports: 20,
    seats: 1,
  },
  BUSINESS: {
    productViews: null,
    aiGenerations: 500,
    storeScans: 50,
    savedProducts: null,
    trackedItems: null,
    exports: null,
    seats: 5,
  },
  AGENCY: {
    productViews: null,
    aiGenerations: null,
    storeScans: null,
    savedProducts: null,
    trackedItems: null,
    exports: null,
    seats: 15,
  },
};

/** Definición comercial de los planes mostrada en /pricing. */
export interface PlanDefinition {
  id: PlanType;
  name: string;
  price: number;
  priceLabel: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  stripePriceEnv?: string;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    priceLabel: "0 $",
    description: "Para explorar el mercado y validar la herramienta.",
    features: [
      "10 productos ganadores al día",
      "3 generaciones de IA al día",
      "1 análisis de tienda al día",
      "Ads Spy con filtros básicos",
      "Histórico de tendencia de 7 días",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 19,
    priceLabel: "19 $/mes",
    description: "Para dropshippers que ya venden y escalan campañas.",
    highlighted: true,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: [
      "Catálogo de productos ilimitado",
      "100 generaciones de IA al día",
      "10 análisis de tiendas al día",
      "Store Tracker con notificaciones",
      "Histórico completo de 30 días",
      "Exportación a CSV",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 49,
    priceLabel: "49 $/mes",
    description: "Para agencias y equipos con varias tiendas.",
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
    features: [
      "Todo lo incluido en Pro",
      "500 generaciones de IA al día",
      "50 análisis de tiendas al día",
      "Seguimiento ilimitado de tiendas y productos",
      "Alertas prioritarias en tiempo real",
      "API pública v1 con claves y 5.000 peticiones/día",
      "Equipo de hasta 5 personas (asientos)",
      "Webhooks a Slack y Discord",
      "Soporte dedicado",
    ],
  },
  {
    id: "AGENCY",
    name: "Agency",
    price: 149,
    priceLabel: "149 $/mes",
    description: "Agencias que gestionan clientes con la herramienta.",
    stripePriceEnv: "STRIPE_PRICE_AGENCY",
    features: [
      "Todo lo incluido en Business",
      "Modo agencia: clientes propios",
      "Asigna productos y tiendas a cada cliente",
      "Informes PDF con marca blanca",
      "Equipo de hasta 15 personas con roles",
      "Cuotas ilimitadas",
    ],
  },
];

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@trendhunter.pro";
export const DEMO_EMAIL = "demo@trendhunter.pro";
export const DEMO_PASSWORD = "demo1234";

// ---------------------------------------------------------------------------
//  Navegación del dashboard
// ---------------------------------------------------------------------------

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: string;
  badge?: string;
  adminOnly?: boolean;
  /** Plan mínimo para verlo (la sidebar filtra local). */
  minPlan?: "PRO" | "BUSINESS" | "AGENCY";
}

/** Secciones de la barra lateral (el icono se resuelve en el componente). */
export const DASHBOARD_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Panel general",
    description: "Resumen de tendencias y oportunidades",
    icon: "LayoutDashboard",
  },
  {
    href: "/dashboard/winning-products",
    label: "Winning Products",
    description: "Catálogo de productos ganadores",
    icon: "Trophy",
    badge: "hot",
  },
  {
    href: "/dashboard/fuentes",
    label: "Fuentes en vivo",
    description: "Catálogos y tendencias reales sin claves",
    icon: "Activity",
    badge: "live",
  },
  {
    href: "/dashboard/ads-spy",
    label: "Ads Spy",
    description: "Biblioteca de anuncios activos",
    icon: "Megaphone",
  },
  {
    href: "/dashboard/shop-analyzer",
    label: "Shop Analyzer",
    description: "Analiza cualquier tienda Shopify",
    icon: "Store",
  },
  {
    href: "/dashboard/equipos",
    label: "Equipo",
    description: "Asientos, roles y accesos del equipo",
    icon: "Users",
    minPlan: "BUSINESS",
  },
  {
    href: "/dashboard/clientes",
    label: "Clientes",
    description: "Modo agencia: clientes propios",
    icon: "Briefcase",
    minPlan: "BUSINESS",
  },
  {
    href: "/dashboard/store-tracker",
    label: "Store Tracker",
    description: "Tiendas monitorizadas y su timeline",
    icon: "Radar",
  },
  {
    href: "/dashboard/product-tracker",
    label: "Product Tracker",
    description: "Productos en seguimiento",
    icon: "LineChart",
  },
  {
    href: "/dashboard/suppliers",
    label: "Suppliers Finder",
    description: "Proveedores con mejor relación calidad-precio",
    icon: "Truck",
  },
  {
    href: "/dashboard/ai-studio",
    label: "AI Studio",
    description: "Copys, guiones y buyer personas con IA",
    icon: "Sparkles",
    badge: "ai",
  },
  {
    href: "/dashboard/api",
    label: "API pública",
    description: "Claves, cuotas y documentación v1",
    icon: "KeyRound",
    minPlan: "BUSINESS",
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
    description: "Perfil, plan y preferencias",
    icon: "Settings",
  },
  {
    href: "/dashboard/admin",
    label: "Panel Admin",
    description: "Gestión de productos y usuarios",
    icon: "ShieldCheck",
    adminOnly: true,
  },
];

/** Elementos del menú de usuario del header. */
export const USER_MENU_ITEMS = [
  { href: "/dashboard/settings", label: "Mi perfil", icon: "User" },
  { href: "/dashboard/settings/billing", label: "Suscripción y facturación", icon: "CreditCard" },
  { href: "/dashboard/settings/notifications", label: "Notificaciones", icon: "Bell" },
];

// ---------------------------------------------------------------------------
//  Varios
// ---------------------------------------------------------------------------

/** Número de días de histórico que genera y muestra la plataforma. */
export const HISTORY_DAYS = 30;

/** Idiomas disponibles en el selector del header. */
export const LOCALES = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
] as const;

/** Fuentes de datos mostradas en el sidebar del dashboard. */
export const DATA_SOURCES = [
  { name: "TikTok Creative Center", status: "live" },
  { name: "Meta Ad Library", status: "live" },
  { name: "Google Trends", status: "live" },
  { name: "Shopify Store Radar", status: "live" },
] as const;
