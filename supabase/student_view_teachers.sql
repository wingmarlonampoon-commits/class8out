-- Run once via: npx supabase db query --linked -f supabase/student_view_teachers.sql
-- Run AFTER freelance_student_login.sql.
--
-- Lets a student list the teachers they can book with: a company student
-- sees their own company's org chart (frontend filters employee_type =
-- 'Teacher'); a freelance student sees only their own single teacher's row.

create policy "Students can view their company's org chart"
  on public.company_organizational_chart for select
  to authenticated
  using (
    exists (
      select 1 from public.student_lists sl
      where sl.email = auth.jwt() ->> 'email'
        and sl.company_code = company_organizational_chart.company_code
    )
  );

create policy "Students can view their own freelance teacher"
  on public.freelance_teachers for select
  to authenticated
  using (
    exists (
      select 1 from public.freelance_students fs
      where fs.email = auth.jwt() ->> 'email'
        and fs.teacher_id = freelance_teachers.id
    )
  );
