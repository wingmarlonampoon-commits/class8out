-- Run once via: npx supabase db query --linked -f supabase/freelance_student_login.sql
--
-- Freelance-added students currently have no login at all (TeacherDashboard/
-- Students.tsx's Add Student form only inserts a plain row, never calls
-- auth.signUp) -- they can't reach the Student Dashboard. Adding a password
-- column here so the frontend can store a bcrypt hash the same way
-- student_lists.password already works for company students.
--
-- The new select policy is additive -- Postgres OR's multiple permissive
-- policies for the same command together, so this doesn't touch the
-- existing teacher_id-scoped policies from freelance_tables.sql.

alter table public.freelance_students add column password text;

create policy "Students can view their own freelance record"
  on public.freelance_students for select
  to authenticated
  using (email = auth.jwt() ->> 'email');
