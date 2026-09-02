-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Books page's "Private" visibility option says "Only Teachers, admins
-- and students within your company can view this book" — but the existing
-- policies only let the company ADMIN view their own (private) books
-- (books_rls.sql). Teachers and Students had no way to see a private book
-- belonging to their own company at all. This adds that: any Teacher
-- (company_organizational_chart) or Student (student_lists) can view a
-- book if it belongs to their own company_code, private or public.

create policy "Employees and students can view their company's books"
  on public.books for select
  to authenticated
  using (
    exists (
      select 1 from public.company_organizational_chart oc
      where oc.email = auth.jwt() ->> 'email'
        and oc.company_code = books.company_code
    )
    or exists (
      select 1 from public.student_lists sl
      where sl.email = auth.jwt() ->> 'email'
        and sl.company_code = books.company_code
    )
  );
