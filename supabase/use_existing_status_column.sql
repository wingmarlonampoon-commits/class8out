-- Run once via: npx supabase db query --linked -f supabase/use_existing_status_column.sql
--
-- Corrects a mistake in class_status_and_details.sql: that migration added a
-- new lowercase `status` column, but `classes` already had a pre-existing,
-- unused `"Status"` (capital S) column added directly in the Supabase table
-- editor — the one the user actually meant ("only consider a class finished
-- if the Status of that class says Completed"). Drop the redundant column
-- and wire everything to the real one instead.

-- Migrate any values already written to the redundant column, then drop it.
update public.classes set "Status" = initcap(status) where "Status" is null;
alter table public.classes drop constraint classes_status_check;
alter table public.classes drop column status;

alter table public.classes alter column "Status" set default 'Booked';
update public.classes set "Status" = 'Booked' where "Status" is null;
alter table public.classes alter column "Status" set not null;
alter table public.classes add constraint classes_status_check check ("Status" in ('Booked', 'Completed'));

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
  set student_id = null, "Status" = 'Booked', class_details = null, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancel_schedule_booking(uuid) to authenticated;
