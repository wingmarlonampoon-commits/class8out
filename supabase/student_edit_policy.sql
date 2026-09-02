-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Students page now lets an admin click a student row to edit their
-- profile (name, gender, email, phone, contacts, subjects, books). student_lists
-- currently has no UPDATE policy at all (see student_lists_rls.sql — only
-- insert/select were added), so admin edits would silently no-op under RLS.
--
-- This mirrors the admin-edit policy added for employees in
-- employee_edit_policies.sql: a company admin may update any student row
-- belonging to their own company.

create policy "Company admins can update their own student list"
  on public.student_lists for update
  to authenticated
  using (company_code in (select public.my_owned_company_codes()))
  with check (company_code in (select public.my_owned_company_codes()));
