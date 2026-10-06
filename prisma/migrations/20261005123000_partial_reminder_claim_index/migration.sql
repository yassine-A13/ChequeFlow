DROP INDEX "notifications_cheque_user_type_channel_key";

CREATE UNIQUE INDEX "notifications_one_sending_due48_web_key"
ON "notifications"("cheque_id", "user_id", "type", "channel")
WHERE "type" = 'DUE_48H' AND "channel" = 'WEB' AND "status" = 'SENDING';
