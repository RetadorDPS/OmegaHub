/**
 * Datos semilla del Suppliers Finder: 12 proveedores mayoristas con métricas
 * de fiabilidad, tiempos de envío y plataformas.
 */

import type { SupplierPlatform } from "@/types";

export interface SeedSupplier {
  name: string;
  platform: SupplierPlatform;
  url: string;
  rating: number;
  reviewCount: number;
  minOrderValue: number;
  shippingTimeDays: number;
  shippingCost: number;
  location: string;
  categories: string[];
  verified: boolean;
  tradeAssurance: boolean;
  priceIndex: number;
  notes: string;
}

export const SEED_SUPPLIERS: SeedSupplier[] = [
  {
    name: "Shenzhen RelaxTech Co., Ltd.",
    platform: "ALIEXPRESS",
    url: "https://es.aliexpress.com/store/relaxtech",
    rating: 4.8, reviewCount: 12_480, minOrderValue: 0, shippingTimeDays: 9, shippingCost: 3.4,
    location: "CN · Shenzhen", categories: ["Salud", "Fitness"], verified: true, tradeAssurance: true, priceIndex: 0.92,
    notes: "Especialista en masajeadores. Envío exprés a España en 9 días y embalaje neutro para dropshipping.",
  },
  {
    name: "Guangzhou GlowSkin Ltd.",
    platform: "ALIEXPRESS",
    url: "https://es.aliexpress.com/store/glowskin",
    rating: 4.7, reviewCount: 8_960, minOrderValue: 0, shippingTimeDays: 11, shippingCost: 4.1,
    location: "CN · Guangzhou", categories: ["Belleza"], verified: true, tradeAssurance: true, priceIndex: 0.95,
    notes: "Máscaras LED y dispositivos de belleza con certificado CE y FDA. Ofrecen etiquetado privado sin coste.",
  },
  {
    name: "Dongguan SoundPro Electronics",
    platform: "ALIEXPRESS",
    url: "https://es.aliexpress.com/store/soundpro",
    rating: 4.6, reviewCount: 21_340, minOrderValue: 0, shippingTimeDays: 12, shippingCost: 2.9,
    location: "CN · Dongguan", categories: ["Tecnología"], verified: true, tradeAssurance: true, priceIndex: 0.88,
    notes: "Fabricante directo de auriculares TWS. Buen precio por volumen y soporte de garantía de 12 meses.",
  },
  {
    name: "CJ Dropshipping Europe Warehouse",
    platform: "CJ_DROPSHIPPING",
    url: "https://cjdropshipping.com/warehouse-europe",
    rating: 4.5, reviewCount: 34_200, minOrderValue: 0, shippingTimeDays: 4, shippingCost: 5.2,
    location: "PL · Wrocław", categories: ["Hogar", "Tecnología", "Mascotas", "Belleza"], verified: true, tradeAssurance: true, priceIndex: 1.08,
    notes: "Almacén europeo: envío en 3-5 días y sin aduanas. Ideal para escalar campañas con tiempos de entrega cortos.",
  },
  {
    name: "Nantong PetComfort Manufacturing",
    platform: "ALIBABA",
    url: "https://www.alibaba.com/supplier/petcomfort",
    rating: 4.7, reviewCount: 1_860, minOrderValue: 250, shippingTimeDays: 26, shippingCost: 0,
    location: "CN · Nantong", categories: ["Mascotas", "Hogar"], verified: true, tradeAssurance: true, priceIndex: 0.62,
    notes: "Precio mayorista real (MOQ 250 $). Mejor opción para marca propia de camas y accesorios de mascotas.",
  },
  {
    name: "Shenzhen StarLight Optoelectronics",
    platform: "ALIEXPRESS",
    url: "https://es.aliexpress.com/store/starlight-opt",
    rating: 4.8, reviewCount: 15_720, minOrderValue: 0, shippingTimeDays: 10, shippingCost: 3.8,
    location: "CN · Shenzhen", categories: ["Hogar", "Tecnología"], verified: true, tradeAssurance: true, priceIndex: 0.9,
    notes: "Proyectores de galaxia y luz ambiental. Acepta pedidos unitarios con factura y SKU propio.",
  },
  {
    name: "Shenzhen SmoothSkin Devices",
    platform: "CJ_DROPSHIPPING",
    url: "https://cjdropshipping.com/supplier/smoothskin",
    rating: 4.6, reviewCount: 6_480, minOrderValue: 0, shippingTimeDays: 8, shippingCost: 4.6,
    location: "CN · Shenzhen", categories: ["Belleza"], verified: true, tradeAssurance: true, priceIndex: 1.0,
    notes: "Depiladoras IPL con certificado CE y manuales en español. Buenas reseñas de calidad del láser.",
  },
  {
    name: "Spocket EU Beauty Suppliers",
    platform: "SPOCKET",
    url: "https://www.spocket.co/marketplace?niche=beauty",
    rating: 4.4, reviewCount: 2_940, minOrderValue: 0, shippingTimeDays: 5, shippingCost: 6.1,
    location: "NL · Rotterdam", categories: ["Belleza", "Salud"], verified: true, tradeAssurance: false, priceIndex: 1.22,
    notes: "Proveedores europeos verificados: entregas en 3-6 días, precios más altos pero margen seguro sin aduanas.",
  },
  {
    name: "Zendrop Fulfillment US",
    platform: "ZENDROP",
    url: "https://app.zendrop.com/explore?fulfillment=us",
    rating: 4.3, reviewCount: 4_120, minOrderValue: 0, shippingTimeDays: 6, shippingCost: 5.8,
    location: "US · Austin", categories: ["Tecnología", "Hogar", "Fitness"], verified: true, tradeAssurance: false, priceIndex: 1.18,
    notes: "Fulfillment en EE. UU. con seguimiento premium. Perfecto para clientes americanos que exigen entrega rápida.",
  },
  {
    name: "Foshan MuscleRecover Tech",
    platform: "ALIEXPRESS",
    url: "https://es.aliexpress.com/store/musclerecover",
    rating: 4.7, reviewCount: 9_340, minOrderValue: 0, shippingTimeDays: 11, shippingCost: 3.6,
    location: "CN · Foshan", categories: ["Fitness", "Salud"], verified: true, tradeAssurance: true, priceIndex: 0.94,
    notes: "Pistolas de masaje con motor brushless. Ofrecen 2 años de garantía con reposición de piezas.",
  },
  {
    name: "NutraLab Europe",
    platform: "CJ_DROPSHIPPING",
    url: "https://cjdropshipping.com/supplier/nutralab-eu",
    rating: 4.8, reviewCount: 3_640, minOrderValue: 0, shippingTimeDays: 3, shippingCost: 5.4,
    location: "ES · Valencia", categories: ["Salud"], verified: true, tradeAssurance: true, priceIndex: 1.14,
    notes: "Suplementos fabricados en la UE con análisis por lote. Permite dropshipping con marca blanca.",
  },
  {
    name: "Chaozhou HomeOrder Industrial",
    platform: "ALIBABA",
    url: "https://www.alibaba.com/supplier/homeorder",
    rating: 4.5, reviewCount: 2_180, minOrderValue: 300, shippingTimeDays: 28, shippingCost: 0,
    location: "CN · Chaozhou", categories: ["Hogar"], verified: true, tradeAssurance: true, priceIndex: 0.58,
    notes: "Organizadores de cocina y menaje. Muy buen coste unitario para pedidos por lotes y stock propio.",
  },
];
