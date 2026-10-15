/**
 * Datos semilla del catálogo: 20 productos ganadores realistas.
 *
 * `metrics` refleja la última foto conocida de cada fuente y `growthBias`
 * controla la pendiente de la serie histórica de 30 días que genera el seed.
 * Los productos con perfil "viral + poca competencia" acaban clasificados como
 * oportunidad dorada por el motor de tendencias (src/lib/trendEngine.ts).
 */

export interface SeedProduct {
  /** Identificador legible usado también para nombrar los ficheros de imagen. */
  code: string;
  title: string;
  description: string;
  category: "Salud" | "Belleza" | "Tecnología" | "Mascotas" | "Hogar" | "Fitness";
  nicheTag: string;
  tags: string[];
  costPrice: number;
  suggestedSellPrice: number;
  supplier: { name: string; aliExpress?: string; amazon?: string; cj?: string };
  metrics: { googleSearchVolume: number; tiktokViews: number; metaAdsCount: number; shopifyStoresUsing: number };
  /** -1 (cayendo) … 1 (despegando): pendiente de la tendencia. */
  growthBias: number;
  estimatedMonthlyRevenue: number;
  estimatedUnitsSold: number;
  countries: string[];
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    code: "p01",
    title: "Masajeador cervical eléctrico con calor y tracción",
    description:
      "Almohada masajeadora 3 en 1 con calor infrarrojo, airbags de tracción y memoria de forma. Alivia la tensión cervical en 15 minutos y funciona con USB, ideal para teletrabajo. Producto con demostración visual muy fuerte en vídeo corto.",
    category: "Salud",
    nicheTag: "Cuidado postural",
    tags: ["alivio del dolor", "teletrabajo", "regalo para padres", "vídeo demo"],
    costPrice: 12.4,
    suggestedSellPrice: 49.99,
    supplier: {
      name: "Shenzhen RelaxTech Co.",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=electric+neck+massager+heat",
      amazon: "https://www.amazon.es/s?k=masajeador+cervical+calor",
      cj: "https://cjdropshipping.com/search/neck-massager",
    },
    metrics: { googleSearchVolume: 720_000, tiktokViews: 38_000_000, metaAdsCount: 430, shopifyStoresUsing: 340 },
    growthBias: 0.55,
    estimatedMonthlyRevenue: 612_000,
    estimatedUnitsSold: 9_400,
    countries: ["ES", "US", "MX", "IT"],
  },
  {
    code: "p02",
    title: "Máscara LED de terapia facial 7 colores",
    description:
      "Dispositivo de fototerapia con 66 LEDs: luz roja para arrugas, azul para acné y verde para manchas. Certificación CE, 20 minutos por sesión y acabado en silicona flexible apto para uso diario.",
    category: "Belleza",
    nicheTag: "Cuidado facial",
    tags: ["skincare", "anti-edad", "rutina de belleza", "alto ticket"],
    costPrice: 18.9,
    suggestedSellPrice: 79.99,
    supplier: {
      name: "Guangzhou GlowSkin Ltd.",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=led+face+mask+light+therapy",
      amazon: "https://www.amazon.es/s?k=mascara+led+facial",
      cj: "https://cjdropshipping.com/search/led-face-mask",
    },
    metrics: { googleSearchVolume: 620_000, tiktokViews: 41_000_000, metaAdsCount: 470, shopifyStoresUsing: 380 },
    growthBias: 0.48,
    estimatedMonthlyRevenue: 884_000,
    estimatedUnitsSold: 11_200,
    countries: ["ES", "US", "FR", "DE", "MX"],
  },
  {
    code: "p03",
    title: "Auriculares TWS con cancelación activa de ruido ANC",
    description:
      "Auriculares inalámbricos con ANC híbrido de 40 dB, 6 micrófonos, 42 horas de autonomía con estuche y Bluetooth 5.4. Resistencia al agua IPX5 y emparejamiento instantáneo con iOS y Android.",
    category: "Tecnología",
    nicheTag: "Audio",
    tags: ["tecnología", "cancelación de ruido", "regalo", "ticket medio"],
    costPrice: 11.2,
    suggestedSellPrice: 39.99,
    supplier: {
      name: "Dongguan SoundPro Electronics",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=anc+tws+earbuds+bluetooth+5.4",
      amazon: "https://www.amazon.es/s?k=auriculares+anc+tws",
      cj: "https://cjdropshipping.com/search/anc-earbuds",
    },
    metrics: { googleSearchVolume: 310_000, tiktokViews: 24_000_000, metaAdsCount: 320, shopifyStoresUsing: 880 },
    growthBias: 0.18,
    estimatedMonthlyRevenue: 1_240_000,
    estimatedUnitsSold: 31_000,
    countries: ["ES", "US", "MX", "AR", "CO"],
  },
  {
    code: "p04",
    title: "Cepillo secador y alisador de aire 5 en 1",
    description:
      "Cepillo eléctrico 5 en 1 con tecnología iónica anti-frizz, 4 velocidades y puntas cerámicas. Seca, alisa y da volumen en una sola pasada con protección térmica de 120 °C.",
    category: "Belleza",
    nicheTag: "Cabello",
    tags: ["haircare", "unboxing", "antes y después", "regalo"],
    costPrice: 14.6,
    suggestedSellPrice: 54.99,
    supplier: {
      name: "Yiwu HairPro Trading",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=hot+air+brush+5+in+1",
      amazon: "https://www.amazon.es/s?k=cepillo+secador+aire",
      cj: "https://cjdropshipping.com/search/hot-air-brush",
    },
    metrics: { googleSearchVolume: 210_000, tiktokViews: 18_000_000, metaAdsCount: 280, shopifyStoresUsing: 640 },
    growthBias: 0.22,
    estimatedMonthlyRevenue: 486_000,
    estimatedUnitsSold: 8_800,
    countries: ["ES", "US", "MX", "CL"],
  },
  {
    code: "p05",
    title: "Cama calmante anti-ansiedad para perros (felpa extra suave)",
    description:
      "Cama donut de felpa premium con efecto abrazo que reduce la ansiedad por separación. Base antideslizante, funda desenfundable y lavable, disponible en 4 tamaños y 6 colores.",
    category: "Mascotas",
    nicheTag: "Cuidado de perros",
    tags: ["mascotas", "hogar", "compra emocional", "recompra"],
    costPrice: 8.9,
    suggestedSellPrice: 34.99,
    supplier: {
      name: "Nantong PetComfort Manufacturing",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=fluffy+calming+dog+bed",
      amazon: "https://www.amazon.es/s?k=cama+perro+calmante+felpa",
      cj: "https://cjdropshipping.com/search/calming-dog-bed",
    },
    metrics: { googleSearchVolume: 165_000, tiktokViews: 14_000_000, metaAdsCount: 210, shopifyStoresUsing: 520 },
    growthBias: 0.1,
    estimatedMonthlyRevenue: 322_000,
    estimatedUnitsSold: 9_200,
    countries: ["ES", "US", "MX"],
  },
  {
    code: "p06",
    title: "Proyector de galaxia y estrellas con altavoz Bluetooth",
    description:
      "Proyector astronómico con 16 discos HD, nebulosa ajustable, altavoz Bluetooth y 8 modos de sonido relajante. Control por mando y app, ideal para dormitorios y contenido de ambientación.",
    category: "Hogar",
    nicheTag: "Iluminación",
    tags: ["viral tiktok", "regalo", "decoración", "altavoz"],
    costPrice: 10.8,
    suggestedSellPrice: 44.99,
    supplier: {
      name: "Shenzhen StarLight Optoelectronics",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=galaxy+star+projector+bluetooth",
      amazon: "https://www.amazon.es/s?k=proyector+galaxia+estrellas",
      cj: "https://cjdropshipping.com/search/galaxy-projector",
    },
    metrics: { googleSearchVolume: 540_000, tiktokViews: 46_000_000, metaAdsCount: 480, shopifyStoresUsing: 420 },
    growthBias: 0.62,
    estimatedMonthlyRevenue: 738_000,
    estimatedUnitsSold: 16_400,
    countries: ["ES", "US", "MX", "MX", "FR"],
  },
  {
    code: "p07",
    title: "Pistola de masaje muscular percusivo 6 niveles",
    description:
      "Masajeador de percusión con motor brushless silencioso (35 dB), 6 intensidades, 4 cabezales intercambiables y batería de 2400 mAh (6 horas). Incluye estuche rígido de transporte.",
    category: "Fitness",
    nicheTag: "Recuperación muscular",
    tags: ["fitness", "recuperación", "gimnasio", "gadget"],
    costPrice: 16.5,
    suggestedSellPrice: 59.99,
    supplier: {
      name: "Foshan MuscleRecover Tech",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=percussion+massage+gun+brushless",
      amazon: "https://www.amazon.es/s?k=pistola+masaje+muscular",
      cj: "https://cjdropshipping.com/search/massage-gun",
    },
    metrics: { googleSearchVolume: 380_000, tiktokViews: 32_000_000, metaAdsCount: 390, shopifyStoresUsing: 410 },
    growthBias: 0.3,
    estimatedMonthlyRevenue: 528_000,
    estimatedUnitsSold: 7_600,
    countries: ["ES", "US", "DE", "GB"],
  },
  {
    code: "p08",
    title: "Especiero giratorio 360° de 3 niveles con 20 frascos",
    description:
      "Organizador de cocina con giro Lazy Susan, acero inoxidable y 20 frascos etiquetados. Aprovecha el espacio en encimeras y armarios; base antideslizante y montaje sin herramientas.",
    category: "Hogar",
    nicheTag: "Organización",
    tags: ["cocina", "organización", "amazon finder", "ticket bajo"],
    costPrice: 9.3,
    suggestedSellPrice: 32.99,
    supplier: {
      name: "Chaozhou HomeOrder Industrial",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=rotating+spice+rack+20+jars",
      amazon: "https://www.amazon.es/s?k=especiero+giratorio",
      cj: "https://cjdropshipping.com/search/spice-rack",
    },
    metrics: { googleSearchVolume: 120_000, tiktokViews: 9_000_000, metaAdsCount: 150, shopifyStoresUsing: 460 },
    growthBias: -0.4,
    estimatedMonthlyRevenue: 214_000,
    estimatedUnitsSold: 6_800,
    countries: ["ES", "US", "MX"],
  },
  {
    code: "p09",
    title: "Comedero automático inteligente WiFi 6L con app",
    description:
      "Dispensador de comida programable con control por app, cámara opcional, porciones de 1 a 10 y grabación de voz para llamar a la mascota. Depósito hermético de 6 litros y batería de respaldo.",
    category: "Mascotas",
    nicheTag: "Comederos inteligentes",
    tags: ["smart home", "mascotas", "automatización", "viajes"],
    costPrice: 19.8,
    suggestedSellPrice: 69.99,
    supplier: {
      name: "Hangzhou PetLink Smart",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=smart+wifi+pet+feeder+6l",
      amazon: "https://www.amazon.es/s?k=comedero+automatico+wifi",
      cj: "https://cjdropshipping.com/search/smart-pet-feeder",
    },
    metrics: { googleSearchVolume: 190_000, tiktokViews: 16_000_000, metaAdsCount: 240, shopifyStoresUsing: 480 },
    growthBias: 0.26,
    estimatedMonthlyRevenue: 396_000,
    estimatedUnitsSold: 5_400,
    countries: ["ES", "US", "FR", "DE"],
  },
  {
    code: "p10",
    title: "Depiladora IPL de luz pulsada con 999.000 destellos",
    description:
      "Aparato IPL doméstico con 5 niveles de potencia, modo deslizante y enfriamiento por zafiro. Reduce el vello hasta un 92 % en 8 semanas, con sensor de piel y garantía de 999.000 destellos.",
    category: "Belleza",
    nicheTag: "Depilación",
    tags: ["beauty tech", "ahorro", "uso en casa", "alto ticket"],
    costPrice: 22.4,
    suggestedSellPrice: 89.99,
    supplier: {
      name: "Shenzhen SmoothSkin Devices",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=ipl+hair+removal+device+999000",
      amazon: "https://www.amazon.es/s?k=depiladora+ipl+luz+pulsada",
      cj: "https://cjdropshipping.com/search/ipl-hair-removal",
    },
    metrics: { googleSearchVolume: 480_000, tiktokViews: 35_000_000, metaAdsCount: 440, shopifyStoresUsing: 340 },
    growthBias: 0.42,
    estimatedMonthlyRevenue: 806_000,
    estimatedUnitsSold: 8_900,
    countries: ["ES", "IT", "FR", "MX"],
  },
  {
    code: "p11",
    title: "Cámara de seguridad WiFi 4K con seguimiento automático",
    description:
      "Cámara PTZ 4K con rotación 360°, seguimiento por IA de personas, visión nocturna a color, audio bidireccional y almacenamiento en microSD o nube. Compatible con Alexa y Google Home.",
    category: "Tecnología",
    nicheTag: "Cámaras y seguridad",
    tags: ["seguridad", "smart home", "hogar", "suscripción"],
    costPrice: 17.3,
    suggestedSellPrice: 62.99,
    supplier: {
      name: "Shenzhen SecureEye Technology",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=ptz+wifi+camera+4k+tracking",
      amazon: "https://www.amazon.es/s?k=camara+seguridad+wifi+4k",
      cj: "https://cjdropshipping.com/search/wifi-camera-4k",
    },
    metrics: { googleSearchVolume: 275_000, tiktokViews: 12_000_000, metaAdsCount: 300, shopifyStoresUsing: 950 },
    growthBias: 0.08,
    estimatedMonthlyRevenue: 452_000,
    estimatedUnitsSold: 7_100,
    countries: ["ES", "US", "MX", "CO"],
  },
  {
    code: "p12",
    title: "Set de 11 bandas elásticas de resistencia premium",
    description:
      "Kit completo de entrenamiento con 11 bandas de látex natural (5 a 50 kg), asas acolchadas, tobilleras, anclaje de puerta y guía de ejercicios. Bolsa de transporte incluida.",
    category: "Fitness",
    nicheTag: "Entrenamiento en casa",
    tags: ["fitness", "casa", "principiantes", "ticket bajo"],
    costPrice: 6.7,
    suggestedSellPrice: 27.99,
    supplier: {
      name: "Yiwu FitBand Industrial",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=resistance+bands+set+11+pieces",
      amazon: "https://www.amazon.es/s?k=bandas+elasticas+resistencia",
      cj: "https://cjdropshipping.com/search/resistance-bands",
    },
    metrics: { googleSearchVolume: 140_000, tiktokViews: 21_000_000, metaAdsCount: 260, shopifyStoresUsing: 1_020 },
    growthBias: 0.14,
    estimatedMonthlyRevenue: 268_000,
    estimatedUnitsSold: 11_600,
    countries: ["ES", "US", "MX", "AR"],
  },
  {
    code: "p13",
    title: "Almohada ortopédica cervical de espuma viscoelástica",
    description:
      "Almohada ergonómica 2 en 1 con soporte cervical y hueco para el brazo, espuma viscoelástica de alta densidad y funda transpirable lavable. Recomendada para dormir de lado y boca arriba.",
    category: "Salud",
    nicheTag: "Sueño y descanso",
    tags: ["descanso", "dolor cervical", "bienestar", "regalo"],
    costPrice: 11.9,
    suggestedSellPrice: 44.99,
    supplier: {
      name: "Nantong SleepWell Foam",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=orthopedic+cervical+memory+foam+pillow",
      amazon: "https://www.amazon.es/s?k=almohada+cervical+ortopedica",
      cj: "https://cjdropshipping.com/search/cervical-pillow",
    },
    metrics: { googleSearchVolume: 340_000, tiktokViews: 27_000_000, metaAdsCount: 360, shopifyStoresUsing: 700 },
    growthBias: 0.34,
    estimatedMonthlyRevenue: 574_000,
    estimatedUnitsSold: 12_800,
    countries: ["ES", "US", "MX", "IT"],
  },
  {
    code: "p14",
    title: "Rodillo facial de crioterapia y gua sha eléctrico",
    description:
      "Set de belleza con rodillo frío/servicio de crioterapia y gua sha de acero inoxidable con vibración. Reduce hinchazón y define el contorno facial en 5 minutos diarios.",
    category: "Belleza",
    nicheTag: "Cuidado facial",
    tags: ["skincare", "viral", "drenaje linfático", "regalo"],
    costPrice: 7.4,
    suggestedSellPrice: 29.99,
    supplier: {
      name: "Guangzhou FaceGlow Beauty",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=ice+roller+gua+sha+electric+vibration",
      amazon: "https://www.amazon.es/s?k=rodillo+facial+crioterapia",
      cj: "https://cjdropshipping.com/search/face-roller",
    },
    metrics: { googleSearchVolume: 260_000, tiktokViews: 23_000_000, metaAdsCount: 290, shopifyStoresUsing: 260 },
    growthBias: 0.38,
    estimatedMonthlyRevenue: 186_000,
    estimatedUnitsSold: 6_200,
    countries: ["ES", "MX", "CO", "CL"],
  },
  {
    code: "p15",
    title: "Fuente de agua automática para gatos con filtro UV",
    description:
      "Bebedero circulante de 2,5 litros con bomba ultrasilenciosa (25 dB), filtro de carbón y luz UV de esterilización. Estimula la hidratación del gato y evita problemas renales.",
    category: "Mascotas",
    nicheTag: "Higiene y cuidado felino",
    tags: ["gatos", "salud", "gadget", "recompra de filtros"],
    costPrice: 10.2,
    suggestedSellPrice: 38.99,
    supplier: {
      name: "Wenzhou CatFlow Electronics",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=automatic+pet+water+fountain+uv",
      amazon: "https://www.amazon.es/s?k=fuente+agua+gatos",
      cj: "https://cjdropshipping.com/search/pet-water-fountain",
    },
    metrics: { googleSearchVolume: 150_000, tiktokViews: 11_000_000, metaAdsCount: 180, shopifyStoresUsing: 430 },
    growthBias: -0.25,
    estimatedMonthlyRevenue: 246_000,
    estimatedUnitsSold: 6_300,
    countries: ["ES", "US", "MX"],
  },
  {
    code: "p16",
    title: "Lámpara de escritorio LED con cargador inalámbrico y altavoz",
    description:
      "Lámpara 3 en 1 con carga inalámbrica de 15 W, altavoz Bluetooth 5.0, 3 temperaturas de luz y control táctil. Diseño de madera y aluminio que encaja en cualquier escritorio.",
    category: "Tecnología",
    nicheTag: "Gadgets para el hogar",
    tags: ["gadget", "escritorio", "regalo original", "multifunción"],
    costPrice: 13.8,
    suggestedSellPrice: 52.99,
    supplier: {
      name: "Zhongshan Lumina Tech",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=desk+lamp+wireless+charger+bluetooth+speaker",
      amazon: "https://www.amazon.es/s?k=lampara+escritorio+cargador+inalambrico",
      cj: "https://cjdropshipping.com/search/desk-lamp-charger",
    },
    metrics: { googleSearchVolume: 230_000, tiktokViews: 15_000_000, metaAdsCount: 250, shopifyStoresUsing: 610 },
    growthBias: 0.16,
    estimatedMonthlyRevenue: 318_000,
    estimatedUnitsSold: 6_000,
    countries: ["ES", "US", "DE", "GB"],
  },
  {
    code: "p17",
    title: "Aspirador de mano inalámbrico 15000 Pa para coche",
    description:
      "Mini aspirador 7 en 1 con 15000 Pa de succión, filtro HEPA lavable, boquillas para rendijas y función sopladora. Batería de 6000 mAh con carga USB-C y maletín de transporte.",
    category: "Hogar",
    nicheTag: "Limpieza",
    tags: ["coche", "limpieza", "gadget", "ticket medio"],
    costPrice: 12.1,
    suggestedSellPrice: 42.99,
    supplier: {
      name: "Ningbo CleanJet Appliances",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=handheld+car+vacuum+15000pa",
      amazon: "https://www.amazon.es/s?k=aspirador+mano+coche",
      cj: "https://cjdropshipping.com/search/handheld-vacuum",
    },
    metrics: { googleSearchVolume: 260_000, tiktokViews: 19_000_000, metaAdsCount: 310, shopifyStoresUsing: 890 },
    growthBias: 0.2,
    estimatedMonthlyRevenue: 412_000,
    estimatedUnitsSold: 9_600,
    countries: ["ES", "US", "MX", "AR"],
  },
  {
    code: "p18",
    title: "Magnesio glicinato 8 complejo 120 cápsulas",
    description:
      "Suplemento de magnesio glicinato con vitaminas B6, D3 y zinc para sueño, energía y recuperación muscular. 120 cápsulas veganas, fabricado en la UE con análisis por lote.",
    category: "Salud",
    nicheTag: "Suplementos",
    tags: ["suplemento", "bienestar", "suscripción", "alta recompra"],
    costPrice: 8.4,
    suggestedSellPrice: 34.9,
    supplier: {
      name: "NutraLab Europe (CJ Dropshipping)",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=magnesium+glycinate+capsules",
      amazon: "https://www.amazon.es/s?k=magnesio+glicinato+capsulas",
      cj: "https://cjdropshipping.com/search/magnesium-glycinate",
    },
    metrics: { googleSearchVolume: 420_000, tiktokViews: 22_000_000, metaAdsCount: 380, shopifyStoresUsing: 520 },
    growthBias: 0.28,
    estimatedMonthlyRevenue: 468_000,
    estimatedUnitsSold: 13_400,
    countries: ["ES", "US", "MX", "CL"],
  },
  {
    code: "p19",
    title: "Mochila antirrobo impermeable con puerto USB",
    description:
      "Mochila de 19 pulgadas con cierres ocultos, compartimento acolchado para portátil de 15,6\", puerto USB de carga y tejido repelente al agua. Diseño ergonómico para viaje y oficina.",
    category: "Tecnología",
    nicheTag: "Accesorios de viaje",
    tags: ["viaje", "oficina", "regalo", "uso diario"],
    costPrice: 10.6,
    suggestedSellPrice: 39.99,
    supplier: {
      name: "Quanzhou TravelGear Bags",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=anti+theft+backpack+usb+15.6",
      amazon: "https://www.amazon.es/s?k=mochila+antirrobo+usb",
      cj: "https://cjdropshipping.com/search/anti-theft-backpack",
    },
    metrics: { googleSearchVolume: 175_000, tiktokViews: 13_000_000, metaAdsCount: 200, shopifyStoresUsing: 780 },
    growthBias: 0.06,
    estimatedMonthlyRevenue: 288_000,
    estimatedUnitsSold: 7_200,
    countries: ["ES", "US", "MX", "CO"],
  },
  {
    code: "p20",
    title: "Kit de barra de pilates con bandas de resistencia ajustables",
    description:
      "Barra de pilates de 3 secciones con 4 niveles de bandas (15-30 kg), asas acolchadas y guía de ejercicios. Se monta en segundos y cabe en la mochila de viaje.",
    category: "Fitness",
    nicheTag: "Yoga y pilates",
    tags: ["pilates", "casa", "mujeres 25-45", "vídeo tutorial"],
    costPrice: 9.8,
    suggestedSellPrice: 36.99,
    supplier: {
      name: "Nantong PilatesFit Sports",
      aliExpress: "https://es.aliexpress.com/wholesale?SearchText=pilates+bar+kit+resistance+bands",
      amazon: "https://www.amazon.es/s?k=barra+pilates+bandas",
      cj: "https://cjdropshipping.com/search/pilates-bar",
    },
    metrics: { googleSearchVolume: 205_000, tiktokViews: 25_000_000, metaAdsCount: 270, shopifyStoresUsing: 470 },
    growthBias: 0.4,
    estimatedMonthlyRevenue: 342_000,
    estimatedUnitsSold: 9_300,
    countries: ["ES", "US", "MX", "IT"],
  },
];

/** Imágenes del catálogo (3 por producto, generadas por scripts/procesar-imagenes.py). */
export function imagenesProducto(code: string): string[] {
  return [1, 2, 3].map((index) => `/images/products/${code}-${index}.jpg`);
}
