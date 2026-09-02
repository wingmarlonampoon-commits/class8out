-- Run once via: npx supabase db query --linked -f supabase/teacher_notes_and_completion_by_time.sql
--
-- Two follow-up refinements from user feedback:
--
-- 1) A teacher without self-booking can still mark their own booked class
--    completed once its scheduled time has passed (compared against "now"
--    in the company's configured timezone) -- self-booking still allows
--    marking completed at any time (e.g. finishing a class early).
--
-- 2) There was no way at all for a teacher to write class notes (only a
--    read-only display of class_notes existed, in Bookings.tsx). Add a
--    narrow RPC, matching the mark_class_completed pattern, that lets a
--    teacher (or admin) set notes on a class without needing a plain
--    UPDATE grant that could otherwise rewrite student_id/Status directly.

create or replace function public.mark_class_completed(p_class_id uuid)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.classes;
  v_is_admin boolean;
  v_is_own_class boolean;
  v_timezone text;
  v_class_at timestamptz;
begin
  select * into v_row from public.classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_is_admin := v_row.company_code in (select public.my_owned_company_codes());
  v_is_own_class := v_row.teacher_id = public.my_teacher_org_chart_id();

  if not v_is_admin and not v_is_own_class then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_row.student_id is null then
    raise exception 'SLOT_NOT_BOOKED';
  end if;

  -- Admin and self-booking-allowed teachers can complete anytime. A
  -- non-self-booking teacher may only complete once the class time passed.
  if not v_is_admin and not public.my_teacher_self_booking_allowed() then
    select cr.company_settings ->> 'timezone' into v_timezone
    from public.company_registration cr
    where cr."CompanyCode" = v_row.company_code
    order by cr.created_at asc
    limit 1;

    v_class_at := (v_row.date::text || ' ' || v_row.start_time::text)::timestamp at time zone coalesce(v_timezone, 'UTC');

    if v_class_at > now() then
      raise exception 'CLASS_NOT_STARTED';
    end if;
  end if;

  update public.classes
  set "Status" = 'Completed', updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.mark_class_completed(uuid) to authenticated;

create or replace function public.update_class_notes(p_class_id uuid, p_notes text)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.classes;
  v_is_admin boolean;
  v_is_own_class boolean;
begin
  select * into v_row from public.classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_is_admin := v_row.company_code in (select public.my_owned_company_codes());
  v_is_own_class := v_row.teacher_id = public.my_teacher_org_chart_id();

  if not v_is_admin and not v_is_own_class then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.classes
  set class_notes = p_notes, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_class_notes(uuid, text) to authenticated;
