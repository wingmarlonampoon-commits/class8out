-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Teacher Dashboard's Settings page needs to: (1) read the signed-in
-- teacher's own row in company_organizational_chart, (2) read their
-- employer's company_registration row so it can display the company's
-- timezone / time interval / self-booking policy (read-only), and (3)
-- update their own row to change their password. None of these are covered
-- by the existing policies, which only let the COMPANY ADMIN (by email
-- match on company_registration) view/manage org chart rows.

create policy "Employees can view their own org chart row"
  on public.company_organizational_chart for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);

create policy "Employees can update their own org chart row"
  on public.company_organizational_chart for update
  to authenticated
  using (auth.jwt() ->> 'email' = email)
  with check (auth.jwt() ->> 'email' = email);

create policy "Employees can view their employer's company record"
  on public.company_registration for select
  to authenticated
  using (
    exists (
      select 1 from public.company_organizational_chart oc
      where oc.email = auth.jwt() ->> 'email'
        and oc.company_code = company_registration."CompanyCode"
    )
  );
