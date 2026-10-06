ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING' AFTER 'PENDING';

CREATE UNIQUE INDEX "notifications_cheque_user_type_channel_key"
ON "notifications"("cheque_id", "user_id", "type", "channel");
