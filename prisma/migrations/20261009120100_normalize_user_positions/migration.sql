-- Data migration: only PLAYER stores a position, from the closed set
-- goalkeeper | defender | midfielder | attacker (see resolvePosition in
-- src/users/validation/credentials.ts). Maps the legacy English values,
-- ignoring case and surrounding whitespace. Re-running it changes nothing.
UPDATE "User" SET "position" = CASE lower(btrim("position"))
    WHEN 'goalkeeper' THEN 'goalkeeper'
    WHEN 'defender'   THEN 'defender'
    WHEN 'midfielder' THEN 'midfielder'
    WHEN 'forward'    THEN 'attacker'
    WHEN 'attacker'   THEN 'attacker'
    WHEN ''           THEN NULL        -- blank string carries no information
    ELSE "position"                    -- unknown free text: left as is
  END
WHERE "role" = 'PLAYER' AND "position" IS NOT NULL;

-- Non-PLAYER roles do not store a position.
UPDATE "User" SET "position" = NULL WHERE "role" <> 'PLAYER' AND "position" IS NOT NULL;
