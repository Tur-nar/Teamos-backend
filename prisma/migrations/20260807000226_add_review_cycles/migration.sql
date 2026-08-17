-- CreateEnum
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CALIBRATING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'UPWARD');

-- CreateEnum
CREATE TYPE "ReviewSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "performance" ADD COLUMN     "lastReviewCycleId" TEXT,
ADD COLUMN     "reviewScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "performance_snapshot" ADD COLUMN     "lastReviewCycleId" TEXT;

-- CreateTable
CREATE TABLE "review_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sections" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "review_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "templateSnapshot" JSONB,
    "excludedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review" (
    "id" TEXT NOT NULL,
    "reviewCycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "responses" JSONB,
    "overallScore" DOUBLE PRECISION,
    "status" "ReviewSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_nomination" (
    "id" TEXT NOT NULL,
    "reviewCycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nominatorId" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "status" "NominationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_session" (
    "id" TEXT NOT NULL,
    "reviewCycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "facilitatorId" TEXT NOT NULL,
    "adjustedScores" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_template_organizationId_idx" ON "review_template"("organizationId");

-- CreateIndex
CREATE INDEX "review_cycle_organizationId_idx" ON "review_cycle"("organizationId");

-- CreateIndex
CREATE INDEX "performance_review_reviewCycleId_idx" ON "performance_review"("reviewCycleId");

-- CreateIndex
CREATE INDEX "performance_review_revieweeId_idx" ON "performance_review"("revieweeId");

-- CreateIndex
CREATE INDEX "performance_review_reviewerId_idx" ON "performance_review"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_review_reviewCycleId_revieweeId_reviewerId_key" ON "performance_review"("reviewCycleId", "revieweeId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "peer_nomination_reviewCycleId_nominatorId_nomineeId_key" ON "peer_nomination"("reviewCycleId", "nominatorId", "nomineeId");

-- CreateIndex
CREATE INDEX "calibration_session_reviewCycleId_idx" ON "calibration_session"("reviewCycleId");

-- AddForeignKey
ALTER TABLE "performance" ADD CONSTRAINT "performance_lastReviewCycleId_fkey" FOREIGN KEY ("lastReviewCycleId") REFERENCES "review_cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_lastReviewCycleId_fkey" FOREIGN KEY ("lastReviewCycleId") REFERENCES "review_cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_template" ADD CONSTRAINT "review_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_template" ADD CONSTRAINT "review_template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle" ADD CONSTRAINT "review_cycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle" ADD CONSTRAINT "review_cycle_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "review_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle" ADD CONSTRAINT "review_cycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review" ADD CONSTRAINT "performance_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_nomination" ADD CONSTRAINT "peer_nomination_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_nomination" ADD CONSTRAINT "peer_nomination_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_nomination" ADD CONSTRAINT "peer_nomination_nominatorId_fkey" FOREIGN KEY ("nominatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_nomination" ADD CONSTRAINT "peer_nomination_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_nomination" ADD CONSTRAINT "peer_nomination_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_session" ADD CONSTRAINT "calibration_session_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "review_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_session" ADD CONSTRAINT "calibration_session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_session" ADD CONSTRAINT "calibration_session_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_session" ADD CONSTRAINT "calibration_session_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
