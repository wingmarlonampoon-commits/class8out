-- Run once via: npx supabase db query --linked -f supabase/student_view_freelance_books.sql
-- Run AFTER fix_student_policy_recursion.sql (depends on my_freelance_student_teacher_id()).
--
-- A freelance student needs to see their teacher's books to pick one when
-- booking a slot, same as company students already can via the existing
-- "Employees and students can view their company's books" policy on books.

create policy "Students can view their freelance teacher's books"
  on public.freelance_books for select
  to authenticated
  using (teacher_id = public.my_freelance_student_teacher_id());
