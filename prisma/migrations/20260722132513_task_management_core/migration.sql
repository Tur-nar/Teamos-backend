/*
  Warnings:

  - The `role` column on the `member` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'supervisor', 'member');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'COMPLETED_LATE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'onLeave';

-- AlterTable
ALTER TABLE "member" DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'member';

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "departmentId" TEXT,
    "dependsOnTaskId" TEXT,
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_organizationId_idx" ON "task"("organizationId");

-- CreateIndex
CREATE INDEX "task_assignedToId_idx" ON "task"("assignedToId");

-- CreateIndex
CREATE INDEX "task_departmentId_idx" ON "task"("departmentId");

-- CreateIndex
CREATE INDEX "task_status_idx" ON "task"("status");

-- CreateIndex
CREATE INDEX "task_priority_idx" ON "task"("priority");

-- CreateIndex
CREATE INDEX "task_deadline_idx" ON "task"("deadline");

-- CreateIndex
CREATE INDEX "subtask_taskId_idx" ON "subtask"("taskId");

-- CreateIndex
CREATE INDEX "task_comment_taskId_idx" ON "task_comment"("taskId");

-- CreateIndex
CREATE INDEX "task_comment_parentCommentId_idx" ON "task_comment"("parentCommentId");

-- CreateIndex
CREATE INDEX "task_attachment_taskId_idx" ON "task_attachment"("taskId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtask" ADD CONSTRAINT "subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "task_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
