-- Run once in pgAdmin Query Tool against your EXISTING business_inventory database.
-- Back up the database first. Do not run schema.sql again on an existing database.
-- Former manager accounts become staff, preserving their IDs and all linked records.

BEGIN;

UPDATE users SET role = 'staff' WHERE role = 'manager';

-- PostgreSQL cannot remove one value from an enum; replace the enum instead.
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
CREATE TYPE user_role_two_roles AS ENUM ('admin', 'staff');
ALTER TABLE users ALTER COLUMN role TYPE user_role_two_roles
  USING role::text::user_role_two_roles;
DROP TYPE user_role;
ALTER TYPE user_role_two_roles RENAME TO user_role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'staff'::user_role;

COMMIT;

-- Check after running: only admin and staff should appear here.
SELECT role, count(*) AS accounts FROM users GROUP BY role ORDER BY role;
