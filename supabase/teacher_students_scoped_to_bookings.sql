-- Run once via: npx supabase db query --linked -f supabase/teacher_students_scoped_to_bookings.sql
--
-- A company-employed teacher should only see students they actually have a
-- booking record with (a row in `classes` naming them as the teacher),
-- not their entire company's roster. The very first booking between a
-- student and a teacher has to come from the admin (who still sees the
-- full roster); after that, the student shows up here for the teacher.
--
-- This narrows the SAME select policy used by both TeacherDashboard/
-- Students.tsx (roster view) and TeacherDashboard/Schedule.tsx (the
-- book-a-student search) -- both already query student_lists purely
-- through RLS, so no frontend query changes are needed.
--
-- Freelance teachers are unaffected: freelance_students is already scoped
-- to teacher_id, since they own their entire student list outright.

drop policy "Teachers can view their own company's student list" on public.student_lists;

create policy "Teachers can view students they have booked"
  on public.student_lists for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.student_id = student_lists.id
        and c.teacher_id = public.my_teacher_org_chart_id()
    )
  );
