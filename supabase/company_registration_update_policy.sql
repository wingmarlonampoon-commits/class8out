-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- company_registration_rls.sql added INSERT and SELECT policies, but the new
-- Company Settings page needs to UPDATE its own row (to save timezone, time
-- interval, and teacher self-booking into company_settings). Without this,
-- saving settings will fail with a permission error (42501).

create policy "Users can update their own company by email"
  on public.company_registration for update
  to authenticated
  using (auth.jwt() ->> 'email' = email)
  with check (auth.jwt() ->> 'email' = email);
