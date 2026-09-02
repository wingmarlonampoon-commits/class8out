-- Run once via: npx supabase db query --linked -f supabase/public_book_owner_names.sql
--
-- Books.tsx (both CompanyDashboard and TeacherDashboard) now shows which
-- company owns a public book. company_registration has no RLS policy
-- letting an unrelated authenticated user read another company's row at
-- all -- and a broad new policy would over-expose email/phone/settings/
-- subscription just to show a display name. This narrow RPC returns only
-- (CompanyCode, company_name) pairs, and only for companies that have
-- actually published at least one public book -- ties the exposure
-- directly to the legitimate need, never usable as a general company-name
-- lookup oracle.

create or replace function public.public_book_owner_names(p_codes text[])
returns table(company_code text, company_name text)
language sql
security definer
stable
set search_path = public
as $$
  select cr."CompanyCode", cr.company_name
  from public.company_registration cr
  where cr."CompanyCode" = any(p_codes)
    and exists (
      select 1 from public.books b
      where b.company_code = cr."CompanyCode" and b."PublicAvailability" = true
    );
$$;

grant execute on function public.public_book_owner_names(text[]) to authenticated;
