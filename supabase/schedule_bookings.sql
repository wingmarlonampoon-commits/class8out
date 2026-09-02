-- Run once via: npx supabase db query --linked -f supabase/schedule_bookings.sql
--
-- Backs the Company Admin "Schedule" page: a weekly per-teacher booking grid
-- where every cell is one (teacher, date, start_time) slot. Cell state is
-- derived, never stored as an enum:
--   - no row for (teacher_id, date, start_time)  -> CLOSED
--   - row exists, student_id IS NULL              -> OPEN
--   - row exists, student_id IS NOT NULL          -> BOOKED
--
-- Repurposes the previously-empty, unconstrained `classes` table (already
-- shaped teacher/student/date/time) instead of inventing a new table.
-- `schedule` (a second empty/unused legacy table) is dropped outright —
-- nothing in the app references it and its shape doesn't fit this design.

drop table if exists public.schedule;

alter table public.classes rename column "time" to start_time;

alter table public.classes
  alter column teacher_code drop not null,
  alter column student_code drop not null;

alter table public.classes drop column teacher_code;
alter table public.classes drop column student_code;

alter table public.classes
  add column teacher_id uuid not null
    references public.company_organizational_chart(id) on delete cascade,
  add column student_id uuid
    references public.student_lists(id) on delete set null;

alter table public.classes
  add constraint classes_teacher_date_start_time_key
  unique (teacher_id, date, start_time);

create index if not exists classes_teacher_date_idx on public.classes (teacher_id, date);
create index if not exists classes_company_date_idx on public.classes (company_code, date);
create index if not exists classes_student_idx on public.classes (student_id) where student_id is not null;

alter table public.classes enable row level security;

create policy "Company admins can view their own company's schedule"
  on public.classes for select
  to authenticated
  using (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can create schedule cells for their own company"
  on public.classes for insert
  to authenticated
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can update schedule cells for their own company"
  on public.classes for update
  to authenticated
  using (company_code in (select public.my_owned_company_codes()))
  with check (company_code in (select public.my_owned_company_codes()));

create policy "Company admins can delete schedule cells for their own company"
  on public.classes for delete
  to authenticated
  using (company_code in (select public.my_owned_company_codes()));

-- Opening/closing an empty slot is a plain client-side insert/delete (no
-- money on the table). Booking and canceling touch a student's Credits
-- balance, so those two actions go through SECURITY DEFINER functions that
-- lock the relevant rows and do the check-decrement-write (or
-- refund-clear) atomically, reusing the same SECURITY DEFINER pattern
-- already established by my_owned_company_codes().

create or replace function public.book_schedule_slot(
  p_teacher_id uuid,
  p_date date,
  p_start_time time,
  p_student_id uuid
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
    set student_id = p_student_id, updated_at = now()
    where id = v_existing_id
    returning * into v_row;
  else
    insert into public.classes (company_code, teacher_id, date, start_time, student_id)
    values (v_teacher_company_code, p_teacher_id, p_date, p_start_time, p_student_id)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.book_schedule_slot(uuid, date, time, uuid) to authenticated;

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
  set student_id = null, updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.cancel_schedule_booking(uuid) to authenticated;
