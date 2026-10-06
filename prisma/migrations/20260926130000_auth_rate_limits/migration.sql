CREATE TABLE "auth_rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "phone_otps" ADD COLUMN "user_id" UUID;
ALTER TABLE "phone_otps" ADD CONSTRAINT "phone_otps_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "auth_rate_limits_window_start_idx" ON "auth_rate_limits"("window_start");
