-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'PROCESSING', 'CASHED', 'NOT_CASHED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'WEB');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DUE_48H', 'DUE_TODAY', 'OVERDUE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('XLSX', 'PDF', 'CSV', 'JSON');

-- CreateEnum
CREATE TYPE "ExportScope" AS ENUM ('ALL', 'SELECTED', 'SINGLE', 'FILTERED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMPTZ(6),
    "phone" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheques" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cheque_number" TEXT NOT NULL,
    "bank" TEXT,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- Prisma schema does not yet express PostgreSQL CHECK constraints. Keep these
-- database-level invariants in this migration when changing the model.
ALTER TABLE "cheques"
    ADD CONSTRAINT "cheques_amount_positive_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "cheques_due_date_not_before_issue_date_check" CHECK ("due_date" >= "issue_date");

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cheque_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "scope" "ExportScope" NOT NULL,
    "file_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "cheques_user_id_idx" ON "cheques"("user_id");

-- CreateIndex
CREATE INDEX "cheques_due_date_idx" ON "cheques"("due_date");

-- CreateIndex
CREATE INDEX "cheques_issue_date_idx" ON "cheques"("issue_date");

-- CreateIndex
CREATE INDEX "cheques_status_idx" ON "cheques"("status");

-- CreateIndex
CREATE INDEX "cheques_beneficiary_idx" ON "cheques"("beneficiary");

-- CreateIndex
CREATE INDEX "cheques_cheque_number_idx" ON "cheques"("cheque_number");

-- CreateIndex
CREATE INDEX "cheques_user_id_due_date_idx" ON "cheques"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "cheques_user_id_status_due_date_idx" ON "cheques"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "cheques_user_id_cheque_number_idx" ON "cheques"("user_id", "cheque_number");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_id_user_id_key" ON "cheques"("id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_cheque_id_idx" ON "notifications"("cheque_id");

-- CreateIndex
CREATE INDEX "notifications_scheduled_at_idx" ON "notifications"("scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_scheduled_at_idx" ON "notifications"("user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "export_history_user_id_idx" ON "export_history"("user_id");

-- CreateIndex
CREATE INDEX "export_history_created_at_idx" ON "export_history"("created_at");

-- CreateIndex
CREATE INDEX "export_history_user_id_created_at_idx" ON "export_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cheque_id_user_id_fkey" FOREIGN KEY ("cheque_id", "user_id") REFERENCES "cheques"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
