-- Migration: Remove Statistics feature
-- Statistics fields removed from frontend; table no longer used.

DROP TABLE IF EXISTS "Statistics" CASCADE;
