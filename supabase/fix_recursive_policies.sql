-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- BUG FIX: several earlier policy files created RLS policies that query the
-- SAME table they protect (or cross-reference two tables that each query
-- each other). Postgres detects this as infinite recursion and every
-- INSERT/SELECT on company_registration now fails with:
--   42P17 infinite recursion detected in policy for relation "company_registration"
-- Confirmed live: a fresh company registration's INSERT now fails with this
-- exact error. This is a genuine bug in the SQL from this session — not
-- something the UI could have caused — and needs fixing regardless of the
-- Employees page work in progress.
--
-- Fix: look up "which company codes does this email own" through a
-- SECURITY DEFINER function instead of a raw subquery. Such a function runs
-- with elevated privileges internally, so its own query does not re-trigger
-- RLS evaluation on the same table — breaking the recursive cycle.

create or replace function public.my_owned_company_codes()
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select "CompanyCode" from public.company_registration where email = auth.jwt() ->> 'email';
$$;

create or replace function public.my_org_chart_company_code()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select company_code from public.company_organizational_chart where email = auth.jwt() ->> 'email' limit 1;
$$;

-- --- company_registration: replace the two recursive policies ---

drop policy if exists "Company admins can add a co-admin to their own company" on public.company_registration;
drop policy if exists "Admins can view co-admins under their own company" on public.company_registration;
drop policy if exists "Employees can view their employer's company record" on public.company_registration;

create policy "Company admins can add a co-admin to their own company"
  on public.company_registration for insert
  to authenticated
  with check ("CompanyCode" in (select public.my_owned_company_codes()));

create policy "Admins can view co-admins under their own company"
  on public.company_registration for select
  to authenticated
  using ("CompanyCode" in (select public.my_owned_company_codes()));

create policy "Employees can view their employer's company record"
  on public.company_registration for select
  to authenticated
  using ("CompanyCode" = public.my_org_chart_company_code());

-- --- company_organizational_chart: replace the two cross-referencing policies ---

drop policy if exists "Company admins can add to their own org chart" on public.company_organizational_chart;
drop policy if exists "Company admins can view their own org chart" on public.company_organizational_chart;

create policy "Company admins can add to their own org chart"
  on public.company_organizational_chart for insert
  to authenticated
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can view their own org chart"
  on public.company_organizational_chart for select
  to authenticated
  using (company_code in (select public.my_owned_company_codes()));
