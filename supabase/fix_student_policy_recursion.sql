-- Run once via: npx supabase db query --linked -f supabase/fix_student_policy_recursion.sql
-- Run AFTER student_booking_rpcs.sql.
--
-- The student-visibility policies added in student_view_teachers.sql /
-- student_view_classes.sql embedded raw cross-table subqueries (e.g.
-- company_organizational_chart's policy querying student_lists directly).
-- That's exactly the recursion trap fix_recursive_policies.sql already
-- solved once this codebase: policy on A queries B -> B's own RLS evaluates
-- ITS policies -> one of those queries C -> C's policy queries A/B again ->
-- infinite recursion. Confirmed live: querying company_organizational_chart
-- as a student now raises "infinite recursion detected in policy for
-- relation student_lists" (company_organizational_chart -> student_lists ->
-- [existing] "Teachers can view students they have booked" -> classes ->
-- [new] "Students can view their company's schedule" -> student_lists...).
--
-- Fix: route every cross-table lookup through a SECURITY DEFINER function
-- (same pattern as my_owned_company_codes/my_teacher_org_chart_id/
-- my_freelance_teacher_id) -- these run as the function owner and bypass
-- RLS entirely, so they can't re-trigger another table's policy evaluation.

create or replace function public.my_student_company_code()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select company_code from public.student_lists where email = auth.jwt() ->> 'email' limit 1;
$$;

create or replace function public.my_freelance_student_teacher_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select teacher_id from public.freelance_students where email = auth.jwt() ->> 'email' limit 1;
$$;

create or replace function public.teacher_has_booked_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.student_id = p_student_id and c.teacher_id = public.my_teacher_org_chart_id()
  );
$$;

-- Re-point the four new student-visibility policies at the functions above.

drop policy "Students can view their company's org chart" on public.company_organizational_chart;
create policy "Students can view their company's org chart"
  on public.company_organizational_chart for select
  to authenticated
  using (company_code = public.my_student_company_code());

drop policy "Students can view their own freelance teacher" on public.freelance_teachers;
create policy "Students can view their own freelance teacher"
  on public.freelance_teachers for select
  to authenticated
  using (id = public.my_freelance_student_teacher_id());

drop policy "Students can view their company's schedule" on public.classes;
create policy "Students can view their company's schedule"
  on public.classes for select
  to authenticated
  using (company_code = public.my_student_company_code());

drop policy "Students can view their freelance teacher's schedule" on public.freelance_classes;
create policy "Students can view their freelance teacher's schedule"
  on public.freelance_classes for select
  to authenticated
  using (teacher_id = public.my_freelance_student_teacher_id());

-- This pre-existing policy (from teacher_students_scoped_to_bookings.sql,
-- earlier this session) had the other half of the cycle -- its raw
-- subquery into `classes` is what let the loop close once `classes` grew a
-- policy that queries back into student_lists.
drop policy "Teachers can view students they have booked" on public.student_lists;
create policy "Teachers can view students they have booked"
  on public.student_lists for select
  to authenticated
  using (public.teacher_has_booked_student(student_lists.id));
