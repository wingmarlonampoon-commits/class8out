-- Run once via: npx supabase db query --linked -f supabase/fix_null_auth_bypass.sql
--
-- CRITICAL FIX. `v_row.teacher_id = public.my_teacher_org_chart_id()`
-- evaluates to SQL NULL (not false) whenever the caller has no row in
-- company_organizational_chart at all -- e.g. a student, or literally any
-- other authenticated account. In PL/pgSQL, `if not v_is_admin and not
-- v_is_own_class then raise exception ... end if` treats a NULL condition
-- as not-true, so the exception is silently SKIPPED and the call succeeds.
--
-- Confirmed live: a second student (student2@gmail.com, with no
-- company_organizational_chart row at all) called cancel_schedule_booking
-- on a class booked by a DIFFERENT student and it succeeded when it should
-- have raised NOT_AUTHORIZED. The same pattern is live in
-- book_schedule_slot and mark_class_completed -- meaning, before this fix,
-- ANY authenticated user (not just a student -- any signed-up account with
-- no teacher/admin relationship to a class at all) could book, cancel, or
-- complete ANY class in ANY company.
--
-- Fix: explicitly guard every my_teacher_org_chart_id() equality check with
-- `is not null` so the comparison can never produce NULL -- an absent
-- teacher identity now deterministically evaluates to false, not NULL.
-- RLS `using` clauses elsewhere in the codebase that follow this same
-- `teacher_id = my_teacher_org_chart_id()` pattern do NOT have this bug --
-- Postgres RLS already treats a NULL using-clause result as "row excluded"
-- (the same as false), so only PL/pgSQL IF-gated exception checks needed
-- this fix.

create or replace function public.book_schedule_slot(
  p_teacher_id uuid, p_date date, p_start_time time, p_student_id uuid, p_class_details jsonb default null
)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_company_code text;
  v_student_company_code text;
  v_student_credits numeric;
  v_existing_id uuid;
  v_existing_student_id uuid;
  v_row public.classes;
  v_is_admin boolean;
  v_is_self_booking_teacher boolean;
  v_is_own_student boolean;
begin
  select company_code into v_teacher_company_code
  from public.company_organizational_chart
  where id = p_teacher_id and employee_type = 'Teacher';

  if v_teacher_company_code is null then
    raise exception 'TEACHER_NOT_FOUND';
  end if;

  v_is_admin := v_teacher_company_code in (select public.my_owned_company_codes());
  v_is_self_booking_teacher :=
    public.my_teacher_org_chart_id() is not null
    and p_teacher_id = public.my_teacher_org_chart_id()
    and public.my_teacher_self_booking_allowed();
  v_is_own_student := exists (
    select 1 from public.student_lists sl
    where sl.id = p_student_id and sl.email = auth.jwt() ->> 'email'
  );

  if not v_is_admin and not v_is_self_booking_teacher and not v_is_own_student then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select company_code, "Credits" into v_student_company_code, v_student_credits
  from public.student_lists where id = p_student_id for update;

  if v_student_company_code is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;
  if v_student_company_code <> v_teacher_company_code then
    raise exception 'STUDENT_WRONG_COMPANY';
  end if;
  if coalesce(v_student_credits, 0) < 1 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  select id, student_id into v_existing_id, v_existing_student_id
  from public.classes
  where teacher_id = p_teacher_id and date = p_date and start_time = p_start_time
  for update;

  if v_existing_id is not null and v_existing_student_id is not null then
    raise exception 'SLOT_ALREADY_BOOKED';
  end if;

  update public.student_lists set "Credits" = v_student_credits - 1, updated_at = now() where id = p_student_id;

  if v_existing_id is not null then
    update public.classes
    set student_id = p_student_id, "Status" = 'Booked', class_details = p_class_details, updated_at = now()
    where id = v_existing_id
    returning * into v_row;
  else
    insert into public.classes (company_code, teacher_id, date, start_time, student_id, "Status", class_details)
    values (v_teacher_company_code, p_teacher_id, p_date, p_start_time, p_student_id, 'Booked', p_class_details)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.book_schedule_slot(uuid, date, time, uuid, jsonb) to authenticated;

create or replace function public.cancel_schedule_booking(p_class_id uuid)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.classes;
  v_is_admin boolean;
  v_is_self_booking_teacher boolean;
  v_is_own_student boolean;
begin
  select * into v_row from public.classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_is_admin := v_row.company_code in (select public.my_owned_company_codes());
  v_is_self_booking_teacher :=
    public.my_teacher_org_chart_id() is not null
    and v_row.teacher_id = public.my_teacher_org_chart_id()
    and public.my_teacher_self_booking_allowed();
  v_is_own_student := v_row.student_id is not null and exists (
    select 1 from public.student_lists sl
    where sl.id = v_row.student_id and sl.email = auth.jwt() ->> 'email'
  );

  if not v_is_admin and not v_is_self_booking_teacher and not v_is_own_student then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_row.student_id is null then
    return v_row;
  end if;

  update public.student_lists set "Credits" = coalesce("Credits", 0) + 1, updated_at = now() where id = v_row.student_id;

  update public.classes
  set student_id = null, "Status" = 'Booked', class_details = null, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancel_schedule_booking(uuid) to authenticated;

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
  v_is_own_class :=
    public.my_teacher_org_chart_id() is not null
    and v_row.teacher_id = public.my_teacher_org_chart_id();

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
