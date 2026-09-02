-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Employees page now lists all Admins under a company (not just the
-- signed-in admin's own row), so admins can see who else co-manages the
-- account. The existing select policy only allows viewing your OWN row —
-- this adds a second, additive policy for viewing co-admins sharing the
-- same CompanyCode, mirroring the existing co-admin INSERT policy.

create policy "Admins can view co-admins under their own company"
  on public.company_registration for select
  to authenticated
  using (
    exists (
      select 1 from public.company_registration cr
      where cr.email = auth.jwt() ->> 'email'
        and cr."CompanyCode" = company_registration."CompanyCode"
    )
  );
