-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Run AFTER student_lists_rls.sql (this depends on student_lists.email,
-- which that file adds).
--
-- The "Contact Support" panel on the Student Dashboard should show the
-- student's own school (their founding admin's contact details) instead of
-- Class8out's own platform support contact. That requires students to be
-- able to read their employer's company_registration row — the same thing
-- Teachers can already do (employee_self_service_policies.sql), just scoped
-- through student_lists instead of company_organizational_chart.

create policy "Students can view their school's company record"
  on public.company_registration for select
  to authenticated
  using (
    exists (
      select 1 from public.student_lists sl
      where sl.email = auth.jwt() ->> 'email'
        and sl.company_code = company_registration."CompanyCode"
    )
  );
