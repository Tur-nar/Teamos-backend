-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('COMPANY', 'TEAM', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "TargetStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'COMPLETED', 'MISSED');

-- CreateTable
CREATE TABLE "target" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TargetType" NOT NULL DEFAULT 'COMPANY',
    "parentTargetId" TEXT,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TargetStatus" NOT NULL DEFAULT 'ON_TRACK',
    "period" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_entry" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_organizationId_idx" ON "target"("organizationId");

-- CreateIndex
CREATE INDEX "target_assignedToId_idx" ON "target"("assignedToId");

-- CreateIndex
CREATE INDEX "target_departmentId_idx" ON "target"("departmentId");

-- CreateIndex
CREATE INDEX "target_type_idx" ON "target"("type");

-- CreateIndex
CREATE INDEX "target_status_idx" ON "target"("status");

-- CreateIndex
CREATE INDEX "target_parentTargetId_idx" ON "target"("parentTargetId");

-- CreateIndex
CREATE INDEX "target_period_idx" ON "target"("period");

-- CreateIndex
CREATE UNIQUE INDEX "target_organizationId_title_period_key" ON "target"("organizationId", "title", "period");

-- CreateIndex
CREATE INDEX "target_entry_targetId_idx" ON "target_entry"("targetId");

-- CreateIndex
CREATE INDEX "target_entry_userId_idx" ON "target_entry"("userId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target" ADD CONSTRAINT "target_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target" ADD CONSTRAINT "target_parentTargetId_fkey" FOREIGN KEY ("parentTargetId") REFERENCES "target"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target" ADD CONSTRAINT "target_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target" ADD CONSTRAINT "target_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target" ADD CONSTRAINT "target_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_entry" ADD CONSTRAINT "target_entry_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_entry" ADD CONSTRAINT "target_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
