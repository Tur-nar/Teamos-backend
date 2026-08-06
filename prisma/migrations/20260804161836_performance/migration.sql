-- CreateTable
CREATE TABLE "performance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksOnTime" INTEGER NOT NULL DEFAULT 0,
    "tasksCompletedLate" INTEGER NOT NULL DEFAULT 0,
    "tasksLate" INTEGER NOT NULL DEFAULT 0,
    "totalTasksAssigned" INTEGER NOT NULL DEFAULT 0,
    "performanceScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "rating" TEXT NOT NULL DEFAULT 'Average',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_snapshot" (
    "id" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "taskCompleted" INTEGER NOT NULL,
    "tasksOnTime" INTEGER NOT NULL,
    "tasksCompletedLate" INTEGER NOT NULL,
    "tasksLate" INTEGER NOT NULL,
    "totalTasksAssigned" INTEGER NOT NULL,
    "performanceScore" DOUBLE PRECISION NOT NULL,
    "rating" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_organizationId_idx" ON "performance"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_organizationId_userId_key" ON "performance"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "performance_snapshot_organizationId_idx" ON "performance_snapshot"("organizationId");

-- CreateIndex
CREATE INDEX "performance_snapshot_userId_idx" ON "performance_snapshot"("userId");

-- CreateIndex
CREATE INDEX "performance_snapshot_performanceId_idx" ON "performance_snapshot"("performanceId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_snapshot_organizationId_userId_period_key" ON "performance_snapshot"("organizationId", "userId", "period");

-- CreateIndex
CREATE INDEX "ai_insight_organizationId_idx" ON "ai_insight"("organizationId");

-- CreateIndex
CREATE INDEX "ai_insight_userId_idx" ON "ai_insight"("userId");

-- AddForeignKey
ALTER TABLE "performance" ADD CONSTRAINT "performance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance" ADD CONSTRAINT "performance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "performance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insight" ADD CONSTRAINT "ai_insight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insight" ADD CONSTRAINT "ai_insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
