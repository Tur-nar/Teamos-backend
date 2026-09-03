-- CreateEnum
CREATE TYPE "RecognitionCategory" AS ENUM ('TEAMWORK', 'INNOVATION', 'LEADERSHIP', 'CUSTOMER_FOCUS', 'GOING_ABOVE_AND_BEYOND', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('BUG', 'COMPLAINT', 'SUGGESTION', 'ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'LATE', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "recognition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "RecognitionCategory" NOT NULL,
    "customCategory" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL DEFAULT 'BUG',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_target" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "complaint_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recognition_organizationId_idx" ON "recognition"("organizationId");

-- CreateIndex
CREATE INDEX "recognition_fromUserId_idx" ON "recognition"("fromUserId");

-- CreateIndex
CREATE INDEX "recognition_toUserId_idx" ON "recognition"("toUserId");

-- CreateIndex
CREATE INDEX "complaint_organizationId_idx" ON "complaint"("organizationId");

-- CreateIndex
CREATE INDEX "complaint_userId_idx" ON "complaint"("userId");

-- CreateIndex
CREATE INDEX "complaint_target_complaintId_idx" ON "complaint_target"("complaintId");

-- CreateIndex
CREATE INDEX "complaint_target_userId_idx" ON "complaint_target"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_target_complaintId_userId_key" ON "complaint_target"("complaintId", "userId");

-- AddForeignKey
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_target" ADD CONSTRAINT "complaint_target_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_target" ADD CONSTRAINT "complaint_target_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
