-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Employees page now lets an admin click a Teacher or co-Admin row to
-- edit their profile (subjects, photo, intro, contact info, phone, etc.).
-- Neither table currently has an UPDATE policy that covers this:
--   - company_organizational_chart has no UPDATE policy for admins at all —
--     only the employee themselves can update their own row (added in
--     employee_self_service_policies.sql, for the Teacher Settings page).
--   - company_registration's only UPDATE policy scopes to a user updating
--     THEIR OWN row (added for the Company Settings page), which doesn't
--     cover one admin editing a co-admin's row.
--
-- These are additive (permissive) policies — they don't replace the
-- existing self-update policies, they just also allow a company admin to
-- update rows belonging to their own company.

create policy "Company admins can update their own org chart"
  on public.company_organizational_chart for update
  to authenticated
  using (company_code in (select public.my_owned_company_codes()))
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can update co-admins in their company"
  on public.company_registration for update
  to authenticated
  using ("CompanyCode" in (select public.my_owned_company_codes()))
  with check ("CompanyCode" in (select public.my_owned_company_codes()));
