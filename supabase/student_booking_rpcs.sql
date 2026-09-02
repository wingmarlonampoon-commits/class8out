-- Run once via: npx supabase db query --linked -f supabase/student_booking_rpcs.sql
-- Run AFTER student_view_classes.sql.
--
-- Adds a student-authorization path to the existing booking RPCs so a
-- student can book/cancel their OWN slot directly, alongside the existing
-- admin and self-booking-teacher paths. Same credit-safe atomic bodies,
-- unchanged signatures (CREATE OR REPLACE, no callers need to change).

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
    p_teacher_id = public.my_teacher_org_chart_id() and public.my_teacher_self_booking_allowed();
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
    v_row.teacher_id = public.my_teacher_org_chart_id() and public.my_teacher_self_booking_allowed();
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

-- Freelance versions previously assumed the caller was ALWAYS the teacher
-- (my_freelance_teacher_id()). Restructured to resolve the caller as
-- EITHER the owning teacher OR the target student themselves.

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
  v_caller_teacher_id uuid;
  v_student_teacher_id uuid;
  v_student_email text;
  v_student_credits numeric;
  v_teacher_id uuid;
  v_existing_id uuid;
  v_existing_student_id uuid;
  v_row public.freelance_classes;
begin
  v_caller_teacher_id := public.my_freelance_teacher_id();

  select teacher_id, "Credits", email into v_student_teacher_id, v_student_credits, v_student_email
  from public.freelance_students
  where id = p_student_id
  for update;

  if v_student_teacher_id is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;

  if v_caller_teacher_id is not null then
    if v_student_teacher_id <> v_caller_teacher_id then
      raise exception 'STUDENT_NOT_YOURS';
    end if;
    v_teacher_id := v_caller_teacher_id;
  elsif v_student_email = auth.jwt() ->> 'email' then
    v_teacher_id := v_student_teacher_id;
  else
    raise exception 'NOT_AUTHORIZED';
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
  v_caller_teacher_id uuid;
  v_row public.freelance_classes;
  v_is_own_student boolean;
begin
  v_caller_teacher_id := public.my_freelance_teacher_id();

  select * into v_row from public.freelance_classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_is_own_student := v_row.student_id is not null and exists (
    select 1 from public.freelance_students fs
    where fs.id = v_row.student_id and fs.email = auth.jwt() ->> 'email'
  );

  if (v_caller_teacher_id is null or v_row.teacher_id <> v_caller_teacher_id) and not v_is_own_student then
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
