-- Individual staff login: bcrypt password hashes live on the staff user.
-- Hashes are backfilled at application startup (see auth/PasswordBackfillRunner)
-- so the migration never embeds a credential.
alter table staff_user add column password_hash text;
