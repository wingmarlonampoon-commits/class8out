-- Run once via: npx supabase db query --linked -f supabase/teacher_open_only_when_ungated.sql
--
-- Correction to teacher_open_close_always_allowed.sql: that migration made
-- BOTH closing a slot and marking a class completed always allowed
-- regardless of teacher_self_booking. The user clarified the intent was
-- narrower — when self-booking is off, the only extra thing a teacher can
-- do is OPEN (declare) their own free slots, to lessen the admin's
-- workload. Closing an already-open slot and marking a booked class
-- completed still require teacher_self_booking to be on. Opening a slot
-- stays unconditional (untouched by this migration).

drop policy "Teachers can close open slots on their own schedule" on public.classes;
create policy "Teachers can close open slots on their own schedule when self-booking is allowed"
  on public.classes for delete
  to authenticated
  using (
    teacher_id = public.my_teacher_org_chart_id()
    and public.my_teacher_self_booking_allowed()
  );

create or replace function public.mark_class_completed(p_class_id uuid)
returns public.classes
language plpgsql
security definer
set search_path = public
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
    raise exception 'SLOT_NOT_BOOKED';
  end if;

  update public.classes
  set "Status" = 'Completed', updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.mark_class_completed(uuid) to authenticated;
