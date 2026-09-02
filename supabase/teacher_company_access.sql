-- Run once via: npx supabase db query --linked -f supabase/teacher_company_access.sql
--
-- Grants a company-employed teacher read access to their own company's
-- student_lists and classes (currently zero RLS permission on either).
-- books already has teacher read access (books_employee_student_view_policy.sql).
--
-- Viewing is never gated — a teacher can always see their own
-- schedule/bookings/roster even when self-booking is off. Only WRITES on
-- classes (open/close a slot, book/cancel, mark-completed, notes/recording)
-- are gated by company_settings.teacher_self_booking, uniformly (a
-- deliberate simplification). Toggling the setting off never touches
-- existing booked rows, only blocks new write attempts.

create or replace function public.my_teacher_org_chart_id()
returns uuid
language sql security definer stable set search_path = public
as $$
  select id from public.company_organizational_chart
  where email = auth.jwt() ->> 'email' and employee_type = 'Teacher'
  limit 1;
$$;

-- Multiple co-admins can share a CompanyCode; Settings.tsx already treats
-- the earliest-created company_registration row as canonical for
-- company-wide policy display — mirrored here for consistency. Defaults to
-- true (matches DEFAULT_COMPANY_SETTINGS.teacher_self_booking) when missing.
create or replace function public.my_teacher_self_booking_allowed()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (
      select (cr.company_settings ->> 'teacher_self_booking')::boolean
      from public.company_organizational_chart oc
      join public.company_registration cr on cr."CompanyCode" = oc.company_code
      where oc.email = auth.jwt() ->> 'email' and oc.employee_type = 'Teacher'
      order by cr.created_at asc
      limit 1
    ),
    true
  );
$$;

create policy "Teachers can view their own company's student list"
  on public.student_lists for select to authenticated
  using (
    exists (
      select 1 from public.company_organizational_chart oc
      where oc.email = auth.jwt() ->> 'email'
        and oc.employee_type = 'Teacher'
        and oc.company_code = student_lists.company_code
    )
  );

create policy "Teachers can view their own schedule"
  on public.classes for select to authenticated
  using (teacher_id = public.my_teacher_org_chart_id());

create policy "Teachers can open slots on their own schedule when self-booking is allowed"
  on public.classes for insert to authenticated
  with check (
    teacher_id = public.my_teacher_org_chart_id()
    and company_code = public.my_org_chart_company_code()
    and student_id is null
    and public.my_teacher_self_booking_allowed()
  );

create policy "Teachers can update their own schedule when self-booking is allowed"
  on public.classes for update to authenticated
  using (teacher_id = public.my_teacher_org_chart_id())
  with check (
    teacher_id = public.my_teacher_org_chart_id()
    and company_code = public.my_org_chart_company_code()
    and public.my_teacher_self_booking_allowed()
  );

create policy "Teachers can close open slots on their own schedule when self-booking is allowed"
  on public.classes for delete to authenticated
  using (
    teacher_id = public.my_teacher_org_chart_id()
    and public.my_teacher_self_booking_allowed()
  );

-- Re-declares book_schedule_slot / cancel_schedule_booking with the SAME
-- signatures as supabase/use_existing_status_column.sql (CREATE OR REPLACE
-- updates them in place, no DROP needed) — adds a second authorization path
-- for the teacher booking themselves, alongside the existing admin path.

create or replace function public.book_schedule_slot(
  p_teacher_id uuid, p_date date, p_start_time time, p_student_id uuid, p_class_details jsonb default null
)
returns public.classes
language plpgsql security definer set search_path = public
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

  if not v_is_admin and not v_is_self_booking_teacher then
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
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.classes;
  v_is_admin boolean;
  v_is_self_booking_teacher boolean;
begin
  select * into v_row from public.classes where id = p_class_id for update;

  if v_row.id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_is_admin := v_row.company_code in (select public.my_owned_company_codes());
  v_is_self_booking_teacher :=
    v_row.teacher_id = public.my_teacher_org_chart_id() and public.my_teacher_self_booking_allowed();

  if not v_is_admin and not v_is_self_booking_teacher then
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
