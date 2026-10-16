/**
 * Datos semilla de tiendas Shopify: 10 tiendas ficticias pero realistas,
 * con top de productos, apps detectadas y métricas estimadas.
 * Se usan en las secciones Shop Analyzer y Store Tracker.
 */

export interface SeedStoreProduct {
  title: string;
  image: string;
  price: number;
  comparePrice?: number;
  salesRank: number;
  estimatedUnitsSold: number;
  productUrl?: string;
}

export interface SeedStore {
  slug: string;
  name: string;
  domain: string;
  shopifyUrl: string;
  niche: string;
  country: string;
  themeName: string;
  estimatedMonthlyRevenue: number;
  monthlyVisits: number;
  avgOrderValue: number;
  conversionRate: number;
  productsCount: number;
  growthRate: number;
  categories: string[];
  appsDetected: string[];
  socialProfiles: Record<string, string>;
  topProducts: SeedStoreProduct[];
}

export const SEED_STORES: SeedStore[] = [
  {
    slug: "wisdomsleep",
    name: "Wisdom Sleep",
    domain: "wisdomsleep.es",
    shopifyUrl: "https://wisdomsleep.es",
    niche: "Salud y descanso",
    country: "ES",
    themeName: "Dawn 12.0",
    estimatedMonthlyRevenue: 412_400,
    monthlyVisits: 186_000,
    avgOrderValue: 47.8,
    conversionRate: 2.4,
    productsCount: 34,
    growthRate: 18.4,
    categories: ["Salud", "Hogar"],
    appsDetected: ["Judge.me", "Klaviyo", "Loox", "Recharge", "GA4"],
    socialProfiles: { instagram: "@wisdomsleep.es", tiktok: "@wisdomsleep", facebook: "wisdomsleep.es" },
    topProducts: [
      { title: "Masajeador cervical eléctrico con calor", image: "/images/products/p01-1.jpg", price: 49.99, comparePrice: 79.99, salesRank: 1, estimatedUnitsSold: 1_240 },
      { title: "Almohada ortopédica cervical viscoelástica", image: "/images/products/p13-1.jpg", price: 44.99, comparePrice: 64.99, salesRank: 2, estimatedUnitsSold: 980 },
      { title: "Magnesio glicinato 8 complejo", image: "/images/products/p18-1.jpg", price: 34.9, comparePrice: 44.9, salesRank: 3, estimatedUnitsSold: 760 },
      { title: "Proyector galaxia con sonidos relajantes", image: "/images/products/p06-1.jpg", price: 44.99, comparePrice: 59.99, salesRank: 4, estimatedUnitsSold: 540 },
    ],
  },
  {
    slug: "glowlabbeauty",
    name: "GlowLab Beauty",
    domain: "glowlabbeauty.com",
    shopifyUrl: "https://glowlabbeauty.com",
    niche: "Belleza y skincare",
    country: "US",
    themeName: "Impulse 7.4",
    estimatedMonthlyRevenue: 889_600,
    monthlyVisits: 412_000,
    avgOrderValue: 68.4,
    conversionRate: 2.9,
    productsCount: 58,
    growthRate: 32.1,
    categories: ["Belleza"],
    appsDetected: ["Recharge", "Yotpo", "Postscript", "Triple Whale", "Klaviyo"],
    socialProfiles: { instagram: "@glowlabbeauty", tiktok: "@glowlab", facebook: "glowlabbeauty" },
    topProducts: [
      { title: "Máscara LED de terapia facial 7 colores", image: "/images/products/p02-1.jpg", price: 79.99, comparePrice: 129.99, salesRank: 1, estimatedUnitsSold: 3_820 },
      { title: "Depiladora IPL de luz pulsada", image: "/images/products/p10-1.jpg", price: 89.99, comparePrice: 149.99, salesRank: 2, estimatedUnitsSold: 2_940 },
      { title: "Cepillo secador y alisador 5 en 1", image: "/images/products/p04-1.jpg", price: 54.99, comparePrice: 79.99, salesRank: 3, estimatedUnitsSold: 2_180 },
      { title: "Rodillo facial de crioterapia y gua sha", image: "/images/products/p14-1.jpg", price: 29.99, comparePrice: 44.99, salesRank: 4, estimatedUnitsSold: 1_760 },
    ],
  },
  {
    slug: "techzenith",
    name: "Tech Zenith",
    domain: "techzenith.store",
    shopifyUrl: "https://techzenith.store",
    niche: "Tecnología y gadgets",
    country: "ES",
    themeName: "Refresh 14.1",
    estimatedMonthlyRevenue: 268_900,
    monthlyVisits: 154_000,
    avgOrderValue: 52.3,
    conversionRate: 1.8,
    productsCount: 76,
    growthRate: 9.7,
    categories: ["Tecnología"],
    appsDetected: ["Judge.me", "Lucky Orange", "GA4", "Facebook Pixel"],
    socialProfiles: { instagram: "@techzenith.store", tiktok: "@techzenith" },
    topProducts: [
      { title: "Auriculares TWS con cancelación de ruido", image: "/images/products/p03-1.jpg", price: 39.99, comparePrice: 59.99, salesRank: 1, estimatedUnitsSold: 1_980 },
      { title: "Cámara de seguridad WiFi 4K", image: "/images/products/p11-1.jpg", price: 62.99, comparePrice: 89.99, salesRank: 2, estimatedUnitsSold: 1_120 },
      { title: "Lámpara de escritorio 3 en 1", image: "/images/products/p16-1.jpg", price: 52.99, comparePrice: 74.99, salesRank: 3, estimatedUnitsSold: 860 },
      { title: "Mochila antirrobo con puerto USB", image: "/images/products/p19-1.jpg", price: 39.99, comparePrice: 59.99, salesRank: 4, estimatedUnitsSold: 740 },
    ],
  },
  {
    slug: "petjoyclub",
    name: "PetJoy Club",
    domain: "petjoyclub.com",
    shopifyUrl: "https://petjoyclub.com",
    niche: "Mascotas",
    country: "US",
    themeName: "Dawn 11.2",
    estimatedMonthlyRevenue: 356_200,
    monthlyVisits: 198_000,
    avgOrderValue: 42.1,
    conversionRate: 2.6,
    productsCount: 41,
    growthRate: 21.6,
    categories: ["Mascotas"],
    appsDetected: ["Loox", "Klaviyo", "Recharge", "Shop Pay"],
    socialProfiles: { instagram: "@petjoyclub", tiktok: "@petjoyclub", facebook: "petjoyclub" },
    topProducts: [
      { title: "Cama calmante anti-ansiedad para perros", image: "/images/products/p05-1.jpg", price: 34.99, comparePrice: 54.99, salesRank: 1, estimatedUnitsSold: 2_640 },
      { title: "Comedero automático WiFi 6L", image: "/images/products/p09-1.jpg", price: 69.99, comparePrice: 99.99, salesRank: 2, estimatedUnitsSold: 1_180 },
      { title: "Fuente de agua automática para gatos", image: "/images/products/p15-1.jpg", price: 38.99, comparePrice: 54.99, salesRank: 3, estimatedUnitsSold: 980 },
    ],
  },
  {
    slug: "casacomfortshop",
    name: "Casa Comfort",
    domain: "casacomfortshop.es",
    shopifyUrl: "https://casacomfortshop.es",
    niche: "Hogar y organización",
    country: "ES",
    themeName: "Craft 13.0",
    estimatedMonthlyRevenue: 187_300,
    monthlyVisits: 121_000,
    avgOrderValue: 38.6,
    conversionRate: 2.1,
    productsCount: 52,
    growthRate: 12.3,
    categories: ["Hogar"],
    appsDetected: ["Judge.me", "GA4", "Omnisend"],
    socialProfiles: { instagram: "@casacomfort.es", tiktok: "@casacomfort" },
    topProducts: [
      { title: "Especiero giratorio 360° 3 niveles", image: "/images/products/p08-1.jpg", price: 32.99, comparePrice: 44.99, salesRank: 1, estimatedUnitsSold: 1_420 },
      { title: "Aspirador de mano 15000 Pa", image: "/images/products/p17-1.jpg", price: 42.99, comparePrice: 59.99, salesRank: 2, estimatedUnitsSold: 1_060 },
      { title: "Proyector de galaxia con altavoz", image: "/images/products/p06-1.jpg", price: 44.99, comparePrice: 64.99, salesRank: 3, estimatedUnitsSold: 820 },
    ],
  },
  {
    slug: "fitrevolutionpro",
    name: "Fit Revolution Pro",
    domain: "fitrevolutionpro.com",
    shopifyUrl: "https://fitrevolutionpro.com",
    niche: "Fitness y recuperación",
    country: "DE",
    themeName: "Impulse 8.1",
    estimatedMonthlyRevenue: 524_800,
    monthlyVisits: 302_000,
    avgOrderValue: 61.9,
    conversionRate: 2.8,
    productsCount: 47,
    growthRate: 26.8,
    categories: ["Fitness", "Salud"],
    appsDetected: ["Triple Whale", "Recharge", "Gorgias", "Klaviyo", "Yotpo"],
    socialProfiles: { instagram: "@fitrevolutionpro", tiktok: "@fitrevolution", youtube: "FitRevolutionPro" },
    topProducts: [
      { title: "Pistola de masaje muscular percusivo", image: "/images/products/p07-1.jpg", price: 59.99, comparePrice: 89.99, salesRank: 1, estimatedUnitsSold: 2_860 },
      { title: "Tabla de equilibrio con bandas", image: "/images/products/p12-1.jpg", price: 27.99, comparePrice: 39.99, salesRank: 2, estimatedUnitsSold: 2_140 },
      { title: "Barra de pilates con bandas ajustables", image: "/images/products/p20-1.jpg", price: 36.99, comparePrice: 52.99, salesRank: 3, estimatedUnitsSold: 1_680 },
    ],
  },
  {
    slug: "lurebeauty",
    name: "Lure Beauty MX",
    domain: "lurebeauty.co",
    shopifyUrl: "https://lurebeauty.co",
    niche: "Belleza y spa en casa",
    country: "MX",
    themeName: "Dawn 12.0",
    estimatedMonthlyRevenue: 148_600,
    monthlyVisits: 96_000,
    avgOrderValue: 34.2,
    conversionRate: 1.9,
    productsCount: 29,
    growthRate: 15.2,
    categories: ["Belleza"],
    appsDetected: ["Judge.me", "Shop Pay", "GA4"],
    socialProfiles: { instagram: "@lurebeauty.mx", tiktok: "@lurebeauty" },
    topProducts: [
      { title: "Rodillo facial de crioterapia y gua sha", image: "/images/products/p14-1.jpg", price: 29.99, comparePrice: 39.99, salesRank: 1, estimatedUnitsSold: 1_180 },
      { title: "Máscara LED de terapia facial", image: "/images/products/p02-1.jpg", price: 79.99, comparePrice: 109.99, salesRank: 2, estimatedUnitsSold: 460 },
    ],
  },
  {
    slug: "gadgetnest",
    name: "Gadget Nest UK",
    domain: "gadgetnest.shop",
    shopifyUrl: "https://gadgetnest.shop",
    niche: "Gadgets y domótica",
    country: "GB",
    themeName: "Refresh 13.2",
    estimatedMonthlyRevenue: 233_500,
    monthlyVisits: 141_000,
    avgOrderValue: 46.7,
    conversionRate: 2.2,
    productsCount: 63,
    growthRate: 11.4,
    categories: ["Tecnología", "Hogar"],
    appsDetected: ["Klaviyo", "Lucky Orange", "Judge.me", "GA4"],
    socialProfiles: { instagram: "@gadgetnest.uk", tiktok: "@gadgetnest" },
    topProducts: [
      { title: "Cámara de seguridad WiFi 4K PTZ", image: "/images/products/p11-1.jpg", price: 62.99, comparePrice: 84.99, salesRank: 1, estimatedUnitsSold: 980 },
      { title: "Lámpara de escritorio con carga inalámbrica", image: "/images/products/p16-1.jpg", price: 52.99, comparePrice: 69.99, salesRank: 2, estimatedUnitsSold: 820 },
      { title: "Auriculares TWS ANC", image: "/images/products/p03-1.jpg", price: 39.99, comparePrice: 54.99, salesRank: 3, estimatedUnitsSold: 1_360 },
    ],
  },
  {
    slug: "mimascota",
    name: "Mi Mascota Feliz",
    domain: "mimascota.es",
    shopifyUrl: "https://mimascota.es",
    niche: "Mascotas",
    country: "ES",
    themeName: "Dawn 10.4",
    estimatedMonthlyRevenue: 96_400,
    monthlyVisits: 74_000,
    avgOrderValue: 31.8,
    conversionRate: 2.0,
    productsCount: 22,
    growthRate: 7.9,
    categories: ["Mascotas"],
    appsDetected: ["Loox", "GA4", "Shop Pay"],
    socialProfiles: { instagram: "@mimascota.es", facebook: "mimascota.es" },
    topProducts: [
      { title: "Fuente de agua para gatos con filtro UV", image: "/images/products/p15-1.jpg", price: 38.99, comparePrice: 49.99, salesRank: 1, estimatedUnitsSold: 640 },
      { title: "Cama calmante para perros talla M", image: "/images/products/p05-1.jpg", price: 34.99, comparePrice: 49.99, salesRank: 2, estimatedUnitsSold: 520 },
    ],
  },
  {
    slug: "zenbodylab",
    name: "Zen Body Lab",
    domain: "zenbodylab.com",
    shopifyUrl: "https://zenbodylab.com",
    niche: "Bienestar y yoga",
    country: "FR",
    themeName: "Craft 12.3",
    estimatedMonthlyRevenue: 412_700,
    monthlyVisits: 224_000,
    avgOrderValue: 55.4,
    conversionRate: 2.5,
    productsCount: 38,
    growthRate: 24.9,
    categories: ["Fitness", "Salud", "Hogar"],
    appsDetected: ["Recharge", "Yotpo", "Klaviyo", "Triple Whale"],
    socialProfiles: { instagram: "@zenbodylab", tiktok: "@zenbodylab", youtube: "ZenBodyLab" },
    topProducts: [
      { title: "Barra de pilates con bandas ajustables", image: "/images/products/p20-1.jpg", price: 36.99, comparePrice: 49.99, salesRank: 1, estimatedUnitsSold: 1_840 },
      { title: "Almohada cervical de espuma viscoelástica", image: "/images/products/p13-1.jpg", price: 44.99, comparePrice: 62.99, salesRank: 2, estimatedUnitsSold: 1_260 },
      { title: "Proyector galaxia con sonidos relajantes", image: "/images/products/p06-1.jpg", price: 44.99, comparePrice: 59.99, salesRank: 3, estimatedUnitsSold: 940 },
    ],
  },
];
