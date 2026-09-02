-- Run once via: npx supabase db query --linked -f supabase/freelance_schedule_bookings.sql
-- Run AFTER freelance_tables.sql.
--
-- Mirrors book_schedule_slot/cancel_schedule_booking's credit-safe atomic
-- pattern against the freelance tables. teacher_id is derived server-side
-- from the caller's own identity (never a caller-supplied parameter) since
-- a freelance teacher only ever books their own schedule.

create or replace function public.book_freelance_slot(
  p_date date,
  p_start_time time,
  p_student_id uuid,
  p_class_details jsonb default null
)
returns public.freelance_classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_student_teacher_id uuid;
  v_student_credits numeric;
  v_existing_id uuid;
  v_existing_student_id uuid;
  v_row public.freelance_classes;
begin
  v_teacher_id := public.my_freelance_teacher_id();

  if v_teacher_id is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select teacher_id, "Credits" into v_student_teacher_id, v_student_credits
  from public.freelance_students
  where id = p_student_id
  for update;

  if v_student_teacher_id is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;

  if v_student_teacher_id <> v_teacher_id then
    raise exception 'STUDENT_NOT_YOURS';
  end if;

  if coalesce(v_student_credits, 0) < 1 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  select id, student_id into v_existing_id, v_existing_student_id
  from public.freelance_classes
  where teacher_id = v_teacher_id and date = p_date and start_time = p_start_time
  for update;

  if v_existing_id is not null and v_existing_student_id is not null then
    raise exception 'SLOT_ALREADY_BOOKED';
  end if;

  update public.freelance_students
  set "Credits" = v_student_credits - 1, updated_at = now()
  where id = p_student_id;

  if v_existing_id is not null then
    update public.freelance_classes
    set student_id = p_student_id, "Status" = 'Booked', class_details = p_class_details, updated_at = now()
    where id = v_existing_id
    returning * into v_row;
  else
    insert into public.freelance_classes (teacher_id, date, start_time, student_id, "Status", class_details)
    values (v_teacher_id, p_date, p_start_time, p_student_id, 'Booked', p_class_details)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.book_freelance_slot(date, time, uuid, jsonb) to authenticated;

create or replace function public.cancel_freelance_booking(p_class_id uuid)
returns public.freelance_classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_row public.freelance_classes;
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
    return v_row;
  end if;

  update public.freelance_students
  set "Credits" = coalesce("Credits", 0) + 1, updated_at = now()
  where id = v_row.student_id;

  update public.freelance_classes
  set student_id = null, "Status" = 'Booked', class_details = null, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancel_freelance_booking(uuid) to authenticated;
