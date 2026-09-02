-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The existing insert policy on company_registration only allows a user to
-- insert a row for their OWN email (self-registration). The new Employees
-- page also lets an existing company admin add a co-admin under the same
-- CompanyCode — a different email, inserted by someone else's session. This
-- adds a second, additive insert policy (RLS OR's policies of the same
-- command together) covering that case: allowed only if the inserter already
-- owns an existing row with the same CompanyCode.

create policy "Company admins can add a co-admin to their own company"
  on public.company_registration for insert
  to authenticated
  with check (
    exists (
      select 1 from public.company_registration cr
      where cr.email = auth.jwt() ->> 'email'
        and cr."CompanyCode" = company_registration."CompanyCode"
    )
  );
