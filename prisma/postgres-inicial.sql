-- ============================================================================
--  TrendHunter Pro · esquema inicial para PostgreSQL / Supabase
-- ============================================================================
--  Generado por scripts/generate-postgres-migration.mjs
--  Idempotente: usa CREATE ... IF NOT EXISTS y tipos ENUM protegidos.
--
--  Cómo aplicarlo:
--    1. Supabase → SQL Editor → New query.
--    2. Pega este fichero completo y pulsa "Run".
--    3. Copia DATABASE_URL (pooler, puerto 6543) y DIRECT_URL (5432) al .env.
--    4. Carga los datos de demostración:  npm run db:seed
--
--  Tablas: 29 · Enums: 20
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TipoDato" AS ENUM ('MEDIDO', 'IMPORTADO', 'ESTIMADO', 'MIXTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "TipoDato" ADD VALUE IF NOT EXISTS 'MEDIDO';

ALTER TYPE "TipoDato" ADD VALUE IF NOT EXISTS 'IMPORTADO';

ALTER TYPE "TipoDato" ADD VALUE IF NOT EXISTS 'ESTIMADO';

ALTER TYPE "TipoDato" ADD VALUE IF NOT EXISTS 'MIXTO';

DO $$ BEGIN
  CREATE TYPE "NivelConfianza" AS ENUM ('VERIFICADO', 'PARCIAL', 'ESTIMADO', 'SIN_DATOS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "NivelConfianza" ADD VALUE IF NOT EXISTS 'VERIFICADO';

ALTER TYPE "NivelConfianza" ADD VALUE IF NOT EXISTS 'PARCIAL';

ALTER TYPE "NivelConfianza" ADD VALUE IF NOT EXISTS 'ESTIMADO';

ALTER TYPE "NivelConfianza" ADD VALUE IF NOT EXISTS 'SIN_DATOS';

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER';

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';

DO $$ BEGIN
  CREATE TYPE "PlanType" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'FREE';

ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'PRO';

ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'BUSINESS';

ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'AGENCY';

DO $$ BEGIN
  CREATE TYPE "SaturationLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SaturationLevel" ADD VALUE IF NOT EXISTS 'LOW';

ALTER TYPE "SaturationLevel" ADD VALUE IF NOT EXISTS 'MEDIUM';

ALTER TYPE "SaturationLevel" ADD VALUE IF NOT EXISTS 'HIGH';

DO $$ BEGIN
  CREATE TYPE "AdPlatform" AS ENUM ('FACEBOOK', 'TIKTOK', 'INSTAGRAM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AdPlatform" ADD VALUE IF NOT EXISTS 'FACEBOOK';

ALTER TYPE "AdPlatform" ADD VALUE IF NOT EXISTS 'TIKTOK';

ALTER TYPE "AdPlatform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

DO $$ BEGIN
  CREATE TYPE "TrendDirection" AS ENUM ('RISING', 'STABLE', 'FALLING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "TrendDirection" ADD VALUE IF NOT EXISTS 'RISING';

ALTER TYPE "TrendDirection" ADD VALUE IF NOT EXISTS 'STABLE';

ALTER TYPE "TrendDirection" ADD VALUE IF NOT EXISTS 'FALLING';

DO $$ BEGIN
  CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PENDING', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';

ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

DO $$ BEGIN
  CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'QUEUED';

ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'RUNNING';

ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'FAILED';

DO $$ BEGIN
  CREATE TYPE "ScanEngine" AS ENUM ('PLAYWRIGHT', 'SIMULATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ScanEngine" ADD VALUE IF NOT EXISTS 'PLAYWRIGHT';

ALTER TYPE "ScanEngine" ADD VALUE IF NOT EXISTS 'SIMULATED';

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('NEW_PRODUCT', 'TREND_ALERT', 'STORE_CHANGE', 'PRICE_CHANGE', 'SYSTEM', 'SUBSCRIPTION', 'SCORE_THRESHOLD', 'SATURATION_ALERT', 'TREND_REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_PRODUCT';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TREND_ALERT';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_CHANGE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PRICE_CHANGE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCORE_THRESHOLD';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SATURATION_ALERT';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TREND_REVERSAL';

DO $$ BEGIN
  CREATE TYPE "StoreChangeType" AS ENUM ('NEW_PRODUCT', 'PRICE_CHANGE', 'SOLD_OUT', 'THEME_CHANGE', 'TRAFFIC_SPIKE', 'REVENUE_MILESTONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'NEW_PRODUCT';

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'PRICE_CHANGE';

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'SOLD_OUT';

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'THEME_CHANGE';

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'TRAFFIC_SPIKE';

ALTER TYPE "StoreChangeType" ADD VALUE IF NOT EXISTS 'REVENUE_MILESTONE';

DO $$ BEGIN
  CREATE TYPE "AiToolType" AS ENUM ('AD_COPY', 'VIDEO_SCRIPT', 'BUYER_PERSONA', 'STORE_NAMES', 'PRODUCT_ANALYSIS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AiToolType" ADD VALUE IF NOT EXISTS 'AD_COPY';

ALTER TYPE "AiToolType" ADD VALUE IF NOT EXISTS 'VIDEO_SCRIPT';

ALTER TYPE "AiToolType" ADD VALUE IF NOT EXISTS 'BUYER_PERSONA';

ALTER TYPE "AiToolType" ADD VALUE IF NOT EXISTS 'STORE_NAMES';

ALTER TYPE "AiToolType" ADD VALUE IF NOT EXISTS 'PRODUCT_ANALYSIS';

DO $$ BEGIN
  CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'GEMINI', 'SIMULATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'OPENAI';

ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'GEMINI';

ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'SIMULATED';

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';

DO $$ BEGIN
  CREATE TYPE "SupplierPlatform" AS ENUM ('ALIEXPRESS', 'CJ_DROPSHIPPING', 'ALIBABA', 'AMAZON', 'SPOCKET', 'ZENDROP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'ALIEXPRESS';

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'CJ_DROPSHIPPING';

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'ALIBABA';

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'AMAZON';

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'SPOCKET';

ALTER TYPE "SupplierPlatform" ADD VALUE IF NOT EXISTS 'ZENDROP';

DO $$ BEGIN
  CREATE TYPE "UsageAction" AS ENUM ('PRODUCT_VIEW', 'AI_GENERATION', 'STORE_SCAN', 'EXPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "UsageAction" ADD VALUE IF NOT EXISTS 'PRODUCT_VIEW';

ALTER TYPE "UsageAction" ADD VALUE IF NOT EXISTS 'AI_GENERATION';

ALTER TYPE "UsageAction" ADD VALUE IF NOT EXISTS 'STORE_SCAN';

ALTER TYPE "UsageAction" ADD VALUE IF NOT EXISTS 'EXPORT';

DO $$ BEGIN
  CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'OWNER';

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'ADMIN';

ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'MEMBER';

DO $$ BEGIN
  CREATE TYPE "TeamMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "TeamMemberStatus" ADD VALUE IF NOT EXISTS 'INVITED';

ALTER TYPE "TeamMemberStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';

ALTER TYPE "TeamMemberStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

DO $$ BEGIN
  CREATE TYPE "WebhookProvider" AS ENUM ('SLACK', 'DISCORD', 'GENERIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "WebhookProvider" ADD VALUE IF NOT EXISTS 'SLACK';

ALTER TYPE "WebhookProvider" ADD VALUE IF NOT EXISTS 'DISCORD';

ALTER TYPE "WebhookProvider" ADD VALUE IF NOT EXISTS 'GENERIC';

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "passwordHash" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "planType" "PlanType" NOT NULL DEFAULT 'FREE',
  "locale" TEXT NOT NULL DEFAULT 'es',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "planRenewsAt" TIMESTAMP(3),
  "planCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "quotaDayKey" TEXT,
  "quotaUsedToday" INTEGER NOT NULL DEFAULT 0,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

CREATE INDEX IF NOT EXISTS "User_planType_idx" ON "User"("planType");

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripePriceId" TEXT,
  "planType" "PlanType" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");

CREATE TABLE IF NOT EXISTS "StripeEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeEvent_eventId_key" ON "StripeEvent"("eventId");

CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "action" "UsageAction" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "dayKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "UsageEvent_userId_dayKey_action_idx" ON "UsageEvent"("userId", "dayKey", "action");

CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "mainImage" TEXT NOT NULL,
  "images" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "category" TEXT NOT NULL,
  "nicheTag" TEXT NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "costPrice" DOUBLE PRECISION NOT NULL,
  "suggestedSellPrice" DOUBLE PRECISION NOT NULL,
  "estimatedMargin" DOUBLE PRECISION NOT NULL,
  "aliExpressUrl" TEXT,
  "amazonUrl" TEXT,
  "cjUrl" TEXT,
  "supplierName" TEXT,
  "trendScore" INTEGER NOT NULL DEFAULT 0,
  "velocityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "saturationLevel" "SaturationLevel" NOT NULL DEFAULT 'MEDIUM',
  "trendDirection" "TrendDirection" NOT NULL DEFAULT 'STABLE',
  "isGoldenOpportunity" BOOLEAN NOT NULL DEFAULT false,
  "googleSearchVolume" INTEGER NOT NULL DEFAULT 0,
  "tiktokViews" INTEGER NOT NULL DEFAULT 0,
  "metaAdsCount" INTEGER NOT NULL DEFAULT 0,
  "storesUsing" INTEGER NOT NULL DEFAULT 0,
  "youtubeViews" INTEGER NOT NULL DEFAULT 0,
  "estimatedMonthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedUnitsSold" INTEGER NOT NULL DEFAULT 0,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'seed',
  "confianza" INTEGER NOT NULL DEFAULT 0,
  "nivelConfianza" "NivelConfianza" NOT NULL DEFAULT 'SIN_DATOS',
  "fuentesMedidas" INTEGER NOT NULL DEFAULT 0,
  "ultimaMedicion" TIMESTAMP(3),
  "countryAvailability" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");

CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");

CREATE INDEX IF NOT EXISTS "Product_nicheTag_idx" ON "Product"("nicheTag");

CREATE INDEX IF NOT EXISTS "Product_trendScore_idx" ON "Product"("trendScore");

CREATE INDEX IF NOT EXISTS "Product_saturationLevel_idx" ON "Product"("saturationLevel");

CREATE TABLE IF NOT EXISTS "TrendMetric" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "googleSearchVolume" INTEGER NOT NULL DEFAULT 0,
  "tiktokViews" INTEGER NOT NULL DEFAULT 0,
  "youtubeViews" INTEGER NOT NULL DEFAULT 0,
  "metaAdsCount" INTEGER NOT NULL DEFAULT 0,
  "shopifyStoresUsing" INTEGER NOT NULL DEFAULT 0,
  "calculatedScore" INTEGER NOT NULL DEFAULT 0,
  "breakdown" JSONB,
  "fuente" TEXT NOT NULL DEFAULT 'motor-interno',
  "fechaMedicion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tipoDato" "TipoDato" NOT NULL DEFAULT 'ESTIMADO',
  "procedencia" JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrendMetric_productId_date_key" ON "TrendMetric"("productId", "date");

CREATE INDEX IF NOT EXISTS "TrendMetric_date_idx" ON "TrendMetric"("date");

CREATE TABLE IF NOT EXISTS "Ad" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "platform" "AdPlatform" NOT NULL,
  "productId" TEXT,
  "mediaUrl" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "videoUrl" TEXT,
  "headline" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "callToAction" TEXT,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "comments" INTEGER NOT NULL DEFAULT 0,
  "shares" INTEGER NOT NULL DEFAULT 0,
  "views" INTEGER NOT NULL DEFAULT 0,
  "daysActive" INTEGER NOT NULL DEFAULT 1,
  "countryTargets" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "nicheTag" TEXT NOT NULL,
  "advertiserName" TEXT NOT NULL,
  "adLibraryUrl" TEXT,
  "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Ad_platform_idx" ON "Ad"("platform");

CREATE INDEX IF NOT EXISTS "Ad_nicheTag_idx" ON "Ad"("nicheTag");

CREATE INDEX IF NOT EXISTS "Ad_daysActive_idx" ON "Ad"("daysActive");

CREATE TABLE IF NOT EXISTS "Store" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shopifyUrl" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "niche" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'US',
  "shopifyDetected" BOOLEAN NOT NULL DEFAULT true,
  "themeName" TEXT,
  "estimatedMonthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedTraffic" INTEGER NOT NULL DEFAULT 0,
  "monthlyVisits" INTEGER NOT NULL DEFAULT 0,
  "avgOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productsCount" INTEGER NOT NULL DEFAULT 0,
  "topProducts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "categories" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "appsDetected" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "socialProfiles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "growthRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "origen" TEXT NOT NULL DEFAULT 'seed',
  "lastScannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Store_shopifyUrl_key" ON "Store"("shopifyUrl");

CREATE INDEX IF NOT EXISTS "Store_niche_idx" ON "Store"("niche");

CREATE INDEX IF NOT EXISTS "Store_country_idx" ON "Store"("country");

CREATE TABLE IF NOT EXISTS "StoreProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT,
  "title" TEXT NOT NULL,
  "image" TEXT,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "comparePrice" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "salesRank" INTEGER NOT NULL DEFAULT 0,
  "estimatedUnitsSold" INTEGER NOT NULL DEFAULT 0,
  "productUrl" TEXT,
  "externalId" TEXT,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoreProduct_storeId_idx" ON "StoreProduct"("storeId");

CREATE INDEX IF NOT EXISTS "StoreProduct_productId_idx" ON "StoreProduct"("productId");

CREATE INDEX IF NOT EXISTS "StoreProduct_lastSeenAt_idx" ON "StoreProduct"("lastSeenAt");

CREATE TABLE IF NOT EXISTS "StoreScan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT,
  "userId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
  "engine" "ScanEngine" NOT NULL DEFAULT 'SIMULATED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "jobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "StoreScan_userId_status_idx" ON "StoreScan"("userId", "status");

CREATE TABLE IF NOT EXISTS "StoreChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT,
  "type" "StoreChangeType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "productTitle" TEXT,
  "imageUrl" TEXT,
  "priceBefore" DOUBLE PRECISION,
  "priceAfter" DOUBLE PRECISION,
  "impactScore" INTEGER NOT NULL DEFAULT 0,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoreChange_storeId_detectedAt_idx" ON "StoreChange"("storeId", "detectedAt");

CREATE TABLE IF NOT EXISTS "SavedProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "notes" TEXT,
  "folder" TEXT NOT NULL DEFAULT 'Favoritos',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedProduct_userId_productId_key" ON "SavedProduct"("userId", "productId");

CREATE INDEX IF NOT EXISTS "SavedProduct_userId_idx" ON "SavedProduct"("userId");

CREATE TABLE IF NOT EXISTS "TrackedStore" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "clienteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrackedStore_userId_storeId_key" ON "TrackedStore"("userId", "storeId");

CREATE INDEX IF NOT EXISTS "TrackedStore_userId_idx" ON "TrackedStore"("userId");

CREATE TABLE IF NOT EXISTS "TrackedProduct" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "targetTrendScore" INTEGER NOT NULL DEFAULT 80,
  "notes" TEXT,
  "clienteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrackedProduct_userId_productId_key" ON "TrackedProduct"("userId", "productId");

CREATE INDEX IF NOT EXISTS "TrackedProduct_userId_idx" ON "TrackedProduct"("userId");

CREATE TABLE IF NOT EXISTS "AlertNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "entityType" TEXT,
  "entityId" TEXT,
  "actionUrl" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AlertNotification_userId_read_idx" ON "AlertNotification"("userId", "read");

CREATE INDEX IF NOT EXISTS "AlertNotification_createdAt_idx" ON "AlertNotification"("createdAt");

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "platform" "SupplierPlatform" NOT NULL,
  "url" TEXT NOT NULL,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 4,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shippingTimeDays" INTEGER NOT NULL DEFAULT 12,
  "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "location" TEXT NOT NULL DEFAULT 'CN',
  "categories" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "tradeAssurance" BOOLEAN NOT NULL DEFAULT false,
  "priceIndex" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Supplier_platform_idx" ON "Supplier"("platform");

CREATE INDEX IF NOT EXISTS "Supplier_rating_idx" ON "Supplier"("rating");

CREATE TABLE IF NOT EXISTS "AiGeneration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "productId" TEXT,
  "tool" "AiToolType" NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB NOT NULL,
  "promptUsed" TEXT,
  "tokensUsed" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiGeneration_userId_tool_idx" ON "AiGeneration"("userId", "tool");

CREATE INDEX IF NOT EXISTS "AiGeneration_createdAt_idx" ON "AiGeneration"("createdAt");

CREATE TABLE IF NOT EXISTS "Cliente" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "dominio" TEXT,
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Cliente_ownerId_idx" ON "Cliente"("ownerId");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "prefijo" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "ultimoUso" TIMESTAMP(3),
  "peticiones" INTEGER NOT NULL DEFAULT 0,
  "peticionesHoy" INTEGER NOT NULL DEFAULT 0,
  "diaUso" TEXT,
  "revocadaEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_prefijo_key" ON "ApiKey"("prefijo");

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hash_key" ON "ApiKey"("hash");

CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "navegador" TEXT NOT NULL DEFAULT 'Navegador',
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "ultimoUso" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

CREATE TABLE IF NOT EXISTS "PriceHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PriceHistory_storeId_title_capturedAt_idx" ON "PriceHistory"("storeId", "title", "capturedAt");

CREATE TABLE IF NOT EXISTS "TrendingTerm" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "term" TEXT NOT NULL,
  "geo" TEXT NOT NULL DEFAULT 'ES',
  "day" TEXT NOT NULL,
  "volume" TEXT NOT NULL DEFAULT '—',
  "approxVolume" INTEGER NOT NULL DEFAULT 0,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "url" TEXT NOT NULL DEFAULT '',
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrendingTerm_term_geo_day_key" ON "TrendingTerm"("term", "geo", "day");

CREATE INDEX IF NOT EXISTS "TrendingTerm_day_geo_idx" ON "TrendingTerm"("day", "geo");

CREATE INDEX IF NOT EXISTS "TrendingTerm_term_idx" ON "TrendingTerm"("term");

CREATE TABLE IF NOT EXISTS "Team" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Team_ownerId_key" ON "Team"("ownerId");

CREATE INDEX IF NOT EXISTS "Team_ownerId_idx" ON "Team"("ownerId");

CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
  "status" "TeamMemberStatus" NOT NULL DEFAULT 'INVITED',
  "inviteToken" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3),
  "lastActiveAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_inviteToken_key" ON "TeamMember"("inviteToken");

CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_teamId_email_key" ON "TeamMember"("teamId", "email");

CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId");

CREATE INDEX IF NOT EXISTS "TeamMember_teamId_status_idx" ON "TeamMember"("teamId", "status");

CREATE TABLE IF NOT EXISTS "Webhook" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "provider" "WebhookProvider" NOT NULL DEFAULT 'GENERIC',
  "eventos" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "secreto" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "ultimoEstado" INTEGER DEFAULT 0,
  "ultimoError" TEXT,
  "ultimoEnvio" TIMESTAMP(3),
  "envios" INTEGER NOT NULL DEFAULT 0,
  "fallos" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Webhook_userId_idx" ON "Webhook"("userId");

DO $$ BEGIN
  ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrendMetric" ADD CONSTRAINT "TrendMetric_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Ad" ADD CONSTRAINT "Ad_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_storeId_fkey" 
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreScan" ADD CONSTRAINT "StoreScan_storeId_fkey" 
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreScan" ADD CONSTRAINT "StoreScan_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreChange" ADD CONSTRAINT "StoreChange_storeId_fkey" 
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreChange" ADD CONSTRAINT "StoreChange_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedProduct" ADD CONSTRAINT "SavedProduct_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedProduct" ADD CONSTRAINT "SavedProduct_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedStore" ADD CONSTRAINT "TrackedStore_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedStore" ADD CONSTRAINT "TrackedStore_storeId_fkey" 
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedStore" ADD CONSTRAINT "TrackedStore_clienteId_fkey" 
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedProduct" ADD CONSTRAINT "TrackedProduct_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedProduct" ADD CONSTRAINT "TrackedProduct_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TrackedProduct" ADD CONSTRAINT "TrackedProduct_clienteId_fkey" 
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertNotification" ADD CONSTRAINT "AlertNotification_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_ownerId_fkey" 
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_storeId_fkey" 
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" 
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
