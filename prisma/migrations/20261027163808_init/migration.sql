-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('MAIN', 'SUBAGENT');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentToolCallStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_parts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "material" TEXT,
    "manufacturingMethod" TEXT,
    "specification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "inputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "cachedInputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "outputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "parentSessionId" TEXT,
    "kind" "ConversationKind" NOT NULL DEFAULT 'MAIN',
    "previousResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentSessionId" TEXT NOT NULL,
    "childSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "billingSessionId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "providerResponseId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL,
    "uncachedInputCost" DECIMAL(20,12) NOT NULL,
    "cachedInputCost" DECIMAL(20,12) NOT NULL,
    "outputCost" DECIMAL(20,12) NOT NULL,
    "totalCost" DECIMAL(20,12) NOT NULL,
    "inputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "cachedInputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "outputPricePerMillion" DECIMAL(12,6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_calls" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AgentToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "externalCost" DECIMAL(20,12),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_sources" (
    "id" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "snippet" TEXT,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "toolCallId" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "agentRunId" TEXT,
    "contentHash" CHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_ownerId_createdAt_idx" ON "projects"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "project_parts_projectId_createdAt_idx" ON "project_parts"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "models_slug_key" ON "models"("slug");

-- CreateIndex
CREATE INDEX "conversation_sessions_userId_projectId_createdAt_idx" ON "conversation_sessions"("userId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_sessions_parentSessionId_idx" ON "conversation_sessions"("parentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_childSessionId_key" ON "agent_runs"("childSessionId");

-- CreateIndex
CREATE INDEX "agent_runs_projectId_createdAt_idx" ON "agent_runs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_parentSessionId_createdAt_idx" ON "agent_runs"("parentSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_status_createdAt_idx" ON "agent_runs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "model_usage_providerResponseId_key" ON "model_usage"("providerResponseId");

-- CreateIndex
CREATE INDEX "model_usage_userId_createdAt_idx" ON "model_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "model_usage_modelId_createdAt_idx" ON "model_usage"("modelId", "createdAt");

-- CreateIndex
CREATE INDEX "model_usage_sessionId_createdAt_idx" ON "model_usage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "model_usage_billingSessionId_createdAt_idx" ON "model_usage"("billingSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "model_usage_agentRunId_createdAt_idx" ON "model_usage"("agentRunId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_tool_calls_agentRunId_createdAt_idx" ON "agent_tool_calls"("agentRunId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_tool_calls_status_createdAt_idx" ON "agent_tool_calls"("status", "createdAt");

-- CreateIndex
CREATE INDEX "search_sources_url_idx" ON "search_sources"("url");

-- CreateIndex
CREATE UNIQUE INDEX "search_sources_toolCallId_url_key" ON "search_sources"("toolCallId", "url");

-- CreateIndex
CREATE INDEX "conversation_messages_sessionId_createdAt_idx" ON "conversation_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "files_projectId_createdAt_idx" ON "files"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "files_sessionId_createdAt_idx" ON "files"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "files_agentRunId_createdAt_idx" ON "files"("agentRunId", "createdAt");

-- CreateIndex
CREATE INDEX "files_contentHash_idx" ON "files"("contentHash");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_parts" ADD CONSTRAINT "project_parts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_childSessionId_fkey" FOREIGN KEY ("childSessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_billingSessionId_fkey" FOREIGN KEY ("billingSessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_usage" ADD CONSTRAINT "model_usage_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_sources" ADD CONSTRAINT "search_sources_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "agent_tool_calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
