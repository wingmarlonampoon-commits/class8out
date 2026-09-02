-- Run once via: npx supabase db query --linked -f supabase/class_status_and_details.sql
--
-- Two changes to the Schedule/Bookings feature:
--
-- 1. "Completed" was being inferred purely from comparing the class's date/
--    time against the current time — but a class whose time has passed
--    isn't necessarily confirmed to have happened (no-shows, etc.). Add an
--    explicit `status` column so "completed" is only ever true when someone
--    actually marks it that way.
--
-- 2. When booking a student who has multiple subjects/books configured, the
--    admin needs to say which one this specific class is for. Store that
--    choice on the existing (previously unused) `class_details` jsonb column
--    as `{ subject, book_id, book_label }`.

alter table public.classes add column status text not null default 'booked';
alter table public.classes add constraint classes_status_check check (status in ('booked', 'completed'));

-- Adding a parameter changes the signature, which in Postgres creates a NEW
-- overload rather than replacing the old one — drop the old 4-arg version
-- first so callers can't accidentally hit a stale copy with no class_details.
drop function if exists public.book_schedule_slot(uuid, date, time, uuid);

create or replace function public.book_schedule_slot(
  p_teacher_id uuid,
  p_date date,
  p_start_time time,
  p_student_id uuid,
  p_class_details jsonb default null
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
begin
  select company_code into v_teacher_company_code
  from public.company_organizational_chart
  where id = p_teacher_id and employee_type = 'Teacher';

  if v_teacher_company_code is null then
    raise exception 'TEACHER_NOT_FOUND';
  end if;

  if v_teacher_company_code not in (select public.my_owned_company_codes()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select company_code, "Credits" into v_student_company_code, v_student_credits
  from public.student_lists
  where id = p_student_id
  for update;

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

  update public.student_lists
  set "Credits" = v_student_credits - 1, updated_at = now()
  where id = p_student_id;

  if v_existing_id is not null then
    update public.classes
    set student_id = p_student_id, status = 'booked', class_details = p_class_details, updated_at = now()
    where id = v_existing_id
    returning * into v_row;
  else
    insert into public.classes (company_code, teacher_id, date, start_time, student_id, status, class_details)
    values (v_teacher_company_code, p_teacher_id, p_date, p_start_time, p_student_id, 'booked', p_class_details)
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
begin
  select * into v_row from public.classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_row.company_code not in (select public.my_owned_company_codes()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_row.student_id is null then
    return v_row;
  end if;

  update public.student_lists
  set "Credits" = coalesce("Credits", 0) + 1, updated_at = now()
  where id = v_row.student_id;

  update public.classes
  set student_id = null, status = 'booked', class_details = null, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancel_schedule_booking(uuid) to authenticated;
