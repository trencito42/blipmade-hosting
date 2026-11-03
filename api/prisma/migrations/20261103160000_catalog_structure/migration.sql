-- Additive catalogue draft. Existing products, prices, options and orders are untouched.

CREATE TYPE "CatalogDiscovery" AS ENUM ('HIDDEN', 'ADVANCED', 'GROUPED', 'FEATURED');
CREATE TYPE "CatalogAddonKind" AS ENUM ('SOFTWARE', 'MANAGED_SERVICE', 'PLATFORM_FEATURE');

CREATE TABLE "CatalogFamily" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "discovery" "CatalogDiscovery" NOT NULL DEFAULT 'HIDDEN',
    "prepared" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogFamily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogVariant" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogPreset" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "variantId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogPresetVersion" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "recommendedRamMb" INTEGER,
    "recommendedCpu" DOUBLE PRECISION,
    "recommendedDiskGb" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPresetVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogAddonDefinition" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "kind" "CatalogAddonKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "productOptionId" TEXT,
    "productId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAddonDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogAddonCompatibility" (
    "addonId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "CatalogAddonCompatibility_pkey" PRIMARY KEY ("addonId","variantId")
);

CREATE UNIQUE INDEX "CatalogFamily_slug_key" ON "CatalogFamily"("slug");
CREATE INDEX "CatalogFamily_prepared_discovery_sortOrder_idx" ON "CatalogFamily"("prepared", "discovery", "sortOrder");

CREATE UNIQUE INDEX "CatalogVariant_productId_key" ON "CatalogVariant"("productId");
CREATE UNIQUE INDEX "CatalogVariant_familyId_slug_key" ON "CatalogVariant"("familyId", "slug");
CREATE INDEX "CatalogVariant_familyId_sortOrder_idx" ON "CatalogVariant"("familyId", "sortOrder");

CREATE UNIQUE INDEX "CatalogPreset_familyId_slug_key" ON "CatalogPreset"("familyId", "slug");
CREATE INDEX "CatalogPreset_familyId_sortOrder_idx" ON "CatalogPreset"("familyId", "sortOrder");

CREATE UNIQUE INDEX "CatalogPresetVersion_presetId_version_key" ON "CatalogPresetVersion"("presetId", "version");
CREATE INDEX "CatalogPresetVersion_presetId_publishedAt_idx" ON "CatalogPresetVersion"("presetId", "publishedAt");

CREATE UNIQUE INDEX "CatalogAddonDefinition_productOptionId_key" ON "CatalogAddonDefinition"("productOptionId");
CREATE UNIQUE INDEX "CatalogAddonDefinition_familyId_slug_key" ON "CatalogAddonDefinition"("familyId", "slug");
CREATE INDEX "CatalogAddonDefinition_familyId_kind_active_idx" ON "CatalogAddonDefinition"("familyId", "kind", "active");

CREATE INDEX "CatalogAddonCompatibility_variantId_idx" ON "CatalogAddonCompatibility"("variantId");

ALTER TABLE "CatalogVariant" ADD CONSTRAINT "CatalogVariant_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CatalogFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogVariant" ADD CONSTRAINT "CatalogVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogPreset" ADD CONSTRAINT "CatalogPreset_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CatalogFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogPreset" ADD CONSTRAINT "CatalogPreset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CatalogVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogPresetVersion" ADD CONSTRAINT "CatalogPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "CatalogPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogAddonDefinition" ADD CONSTRAINT "CatalogAddonDefinition_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CatalogFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogAddonDefinition" ADD CONSTRAINT "CatalogAddonDefinition_productOptionId_fkey" FOREIGN KEY ("productOptionId") REFERENCES "ProductOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogAddonDefinition" ADD CONSTRAINT "CatalogAddonDefinition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogAddonCompatibility" ADD CONSTRAINT "CatalogAddonCompatibility_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "CatalogAddonDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogAddonCompatibility" ADD CONSTRAINT "CatalogAddonCompatibility_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CatalogVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
