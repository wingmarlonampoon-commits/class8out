-- Run once via: npx supabase db query --linked -f supabase/fix_public_books_visibility.sql
--
-- "Anyone can view public books" was scoped to the `anon` role only, never
-- `authenticated`. Every authenticated caller in the app (company teachers/
-- students, freelance teachers/students) is logged in, so this policy has
-- never actually applied to any of them -- the `.or('company_code.eq...,
-- PublicAvailability.eq.true')` pattern already used in several pages
-- (TeacherDashboard/Schedule.tsx, StudentDashboard/Teachers.tsx) silently
-- only ever returned same-company books, never another company's public
-- ones. This also blocked freelance teachers/students, who have no
-- company_code at all and were relying entirely on this policy.

drop policy "Anyone can view public books" on public.books;

create policy "Anyone can view public books"
  on public.books for select
  to anon, authenticated
  using ("PublicAvailability" = true);
