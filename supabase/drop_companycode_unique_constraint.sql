-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- company_registration."CompanyCode" has a UNIQUE constraint, left over from
-- when the schema assumed one row = one company. The Employees "Add Admin"
-- feature needs multiple rows (one per co-admin) to share the same
-- CompanyCode — that's the whole point of a co-admin. The id column (uuid,
-- primary key) already guarantees each ROW is unique; CompanyCode's own
-- uniqueness was a separate, now-incorrect assumption. Confirmed live: a
-- second admin row under an existing CompanyCode fails with
--   23505 duplicate key value violates unique constraint "company_registration_CompanyCode_key"

alter table public.company_registration drop constraint "company_registration_CompanyCode_key";
