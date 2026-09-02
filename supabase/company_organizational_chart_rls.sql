-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- company_organizational_chart currently has NO row level security at all —
-- confirmed live: an unauthenticated request with only the public anon key
-- was able to INSERT a row. This enables RLS and scopes access to admins
-- of the matching company (verified by email against company_registration),
-- the same ownership pattern used for company_registration itself.

alter table public.company_organizational_chart enable row level security;

create policy "Company admins can add to their own org chart"
  on public.company_organizational_chart for insert
  to authenticated
  with check (
    exists (
      select 1 from public.company_registration cr
      where cr.email = auth.jwt() ->> 'email'
        and cr."CompanyCode" = company_organizational_chart.company_code
    )
  );

create policy "Company admins can view their own org chart"
  on public.company_organizational_chart for select
  to authenticated
  using (
    exists (
      select 1 from public.company_registration cr
      where cr.email = auth.jwt() ->> 'email'
        and cr."CompanyCode" = company_organizational_chart.company_code
    )
  );
