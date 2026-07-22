/*
  Warnings:

  - The `status` column on the `user_profile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[userId,organizationId]` on the table `user_profile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organizationId` to the `user_profile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- DropIndex
DROP INDEX "user_profile_userId_key";

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "organizationId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_organizationId_idx" ON "department"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "department_organizationId_name_key" ON "department"("organizationId", "name");

-- CreateIndex
CREATE INDEX "user_profile_organizationId_idx" ON "user_profile"("organizationId");

-- CreateIndex
CREATE INDEX "user_profile_departmentId_idx" ON "user_profile"("departmentId");

-- CreateIndex
CREATE INDEX "user_profile_supervisorId_idx" ON "user_profile"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_userId_organizationId_key" ON "user_profile"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
