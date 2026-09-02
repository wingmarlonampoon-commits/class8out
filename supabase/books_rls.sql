-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- books currently has NO row level security at all — confirmed live the same
-- way company_organizational_chart and student_lists were found wide open:
-- an unauthenticated request with only the public anon key was able to
-- INSERT a row. This enables RLS.
--
-- Books are added by URL (not a file upload), and each one can be marked
-- public or private — adding the missing column for that, matching the
-- naming style already used on student_lists.PublicAvailability. Public
-- books are visible to anyone (the "Public Book Access" feature listed on
-- every pricing plan); private books are visible only to the owning
-- company's admins.

alter table public.books add column "PublicAvailability" boolean not null default true;

alter table public.books enable row level security;

create policy "Company admins can add to their own books"
  on public.books for insert
  to authenticated
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can view their own books"
  on public.books for select
  to authenticated
  using (company_code in (select public.my_owned_company_codes()));

create policy "Anyone can view public books"
  on public.books for select
  to anon
  using ("PublicAvailability" = true);

-- Signed-in admins also need to browse public books from OTHER companies
-- (e.g. when assigning books to a student on the Students page) — the
-- policy above only covers the anon role, not authenticated requests.
create policy "Authenticated users can view public books"
  on public.books for select
  to authenticated
  using ("PublicAvailability" = true);
