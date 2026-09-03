-- AlterTable
ALTER TABLE "user" ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark existing users as onboarded if they already belong to at least one org
UPDATE "user"
SET "onboarded" = true
WHERE "id" IN (SELECT DISTINCT "userId" FROM "member");
