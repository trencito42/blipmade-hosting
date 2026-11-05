-- A preset can install plugins with the server. The list is part of a version, so a published version never changes.
ALTER TABLE "CatalogPresetVersion" ADD COLUMN "plugins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
