-- Run once via: npx supabase db query --linked -f supabase/freelance_teachers_rls.sql
--
-- freelance_teachers has RLS disabled and no unique constraint on email.
-- Identity resolution (useTeacherIdentity) and login both match a teacher's
-- own row by JWT email, so email must be unique here the same way it
-- functions as the de-facto key on the other identity tables.

alter table public.freelance_teachers
  add constraint freelance_teachers_email_key unique (email);

alter table public.freelance_teachers enable row level security;

create or replace function public.my_freelance_teacher_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.freelance_teachers where email = auth.jwt() ->> 'email' limit 1;
$$;

-- auth.signUp() runs first (establishing a session for the new user), THEN
-- this insert runs as that now-authenticated user — safe to scope INSERT to
-- "your own email", same pattern as student_lists_rls.sql's self-registration policy.
create policy "Freelance teachers can create their own row"
  on public.freelance_teachers for insert
  to authenticated
  with check (email = auth.jwt() ->> 'email');

create policy "Freelance teachers can view their own row"
  on public.freelance_teachers for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

create policy "Freelance teachers can update their own row"
  on public.freelance_teachers for update
  to authenticated
  using (email = auth.jwt() ->> 'email')
  with check (email = auth.jwt() ->> 'email');
