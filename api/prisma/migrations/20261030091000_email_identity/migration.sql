ALTER TABLE "User" ADD COLUMN "emailIdentity" TEXT;

UPDATE "User"
SET "emailIdentity" = CASE
  WHEN lower(split_part("email", '@', 2)) IN ('gmail.com', 'googlemail.com') THEN
    regexp_replace(split_part(lower(split_part("email", '@', 1)), '+', 1), '\.', '', 'g') || '@gmail.com'
  WHEN lower(split_part("email", '@', 2)) IN ('outlook.com', 'hotmail.com', 'live.com') THEN
    split_part(lower(split_part("email", '@', 1)), '+', 1) || '@' || lower(split_part("email", '@', 2))
  ELSE lower("email")
END;

CREATE UNIQUE INDEX "User_emailIdentity_key" ON "User"("emailIdentity");
