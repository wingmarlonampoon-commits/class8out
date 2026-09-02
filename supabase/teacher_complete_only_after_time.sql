-- Run once via: npx supabase db query --linked -f supabase/teacher_complete_only_after_time.sql
--
-- Correction to teacher_notes_and_completion_by_time.sql: that migration
-- let a self-booking-enabled teacher mark a class completed at any time,
-- even before it started. The user clarified that doesn't make sense --
-- no teacher (self-booking allowed or not) should be able to complete a
-- class before its scheduled time has passed. Admins are unaffected (they
-- already have a plain UPDATE grant and can complete anytime, same as
-- before).

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

  -- Admins can complete anytime. Any teacher (regardless of self-booking)
  -- may only complete once the class's scheduled time has passed.
  if not v_is_admin then
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

-- Same "only after the scheduled time" rule for freelance teachers -- they
-- have no admin/self-booking distinction (they own their whole schedule),
-- but completing a class before it happened is equally nonsensical there.
create or replace function public.mark_freelance_class_completed(p_class_id uuid)
returns public.freelance_classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.freelance_classes;
  v_teacher_id uuid;
  v_timezone text;
  v_class_at timestamptz;
begin
  v_teacher_id := public.my_freelance_teacher_id();

  select * into v_row from public.freelance_classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_teacher_id is null or v_row.teacher_id <> v_teacher_id then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_row.student_id is null then
    raise exception 'SLOT_NOT_BOOKED';
  end if;

  select settings ->> 'timezone' into v_timezone
  from public.freelance_teachers
  where id = v_teacher_id;

  v_class_at := (v_row.date::text || ' ' || v_row.start_time::text)::timestamp at time zone coalesce(v_timezone, 'UTC');

  if v_class_at > now() then
    raise exception 'CLASS_NOT_STARTED';
  end if;

  update public.freelance_classes
  set "Status" = 'Completed', updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.mark_freelance_class_completed(uuid) to authenticated;
