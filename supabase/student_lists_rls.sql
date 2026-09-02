-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- student_lists currently has NO row level security at all — confirmed live,
-- the same way company_organizational_chart was found wide open earlier:
-- an unauthenticated request with only the public anon key was able to
-- INSERT a row. This enables RLS and scopes access to admins of the
-- matching company, reusing the my_owned_company_codes() helper function
-- created in fix_recursive_policies.sql (avoids the same recursion bug).
--
-- Also adds a "books" column (jsonb array of books.id) so the Students page
-- can associate a student with books from their own company or public books
-- from any company.
--
-- Also adds a top-level "email" column. Students can optionally be given a
-- real login (Supabase Auth account, same pattern as Employees.tsx), and the
-- app looks up a student's own row by matching this column against their
-- signed-in auth email — the same pattern company_registration and
-- company_organizational_chart already use. (The "password" column already
-- exists on this table and was previously unused.)

alter table public.student_lists add column books jsonb;
alter table public.student_lists add column email character varying;

alter table public.student_lists enable row level security;

create policy "Company admins can add to their own student list"
  on public.student_lists for insert
  to authenticated
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can view their own student list"
  on public.student_lists for select
  to authenticated
  using (company_code in (select public.my_owned_company_codes()));

-- Students can also self-register via a company's public "/join/:companyCode"
-- link (StudentRegister.tsx) instead of an admin adding them manually. They
-- sign themselves up (their own auth session, own email) so this is scoped
-- to their own email rather than company ownership — any authenticated user
-- can insert/view only the row matching their own JWT email.

create policy "Students can create their own record"
  on public.student_lists for insert
  to authenticated
  with check (email = auth.jwt() ->> 'email');

create policy "Students can view their own record"
  on public.student_lists for select
  to authenticated
  using (email = auth.jwt() ->> 'email');
