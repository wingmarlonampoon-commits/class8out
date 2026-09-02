-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- company_registration currently has Row Level Security ENABLED with no
-- policies, which blocks every operation by default (including sign-up).
-- These two policies let a signed-up user create their own company row and
-- read it back, scoped by their verified email — no user_id column needed.

create policy "Authenticated users can register a company"
  on public.company_registration for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = email);

create policy "Users can view their own company by email"
  on public.company_registration for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);
