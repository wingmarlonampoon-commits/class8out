-- Run once via: npx supabase db query --linked -f supabase/teacher_open_close_always_allowed.sql
--
-- Refinement: a company-employed teacher without self-booking permission
-- should still be able to declare their own availability (open/close empty
-- slots) and mark their own already-booked classes as completed — neither
-- touches credits or assigns a student, it just reduces the admin's
-- workload (the teacher pre-opens their free times; the admin only has to
-- pick a student for an already-open slot). Only actually BOOKING or
-- CANCELING a specific student — which moves credits — stays gated by
-- teacher_self_booking, via the existing book_schedule_slot/
-- cancel_schedule_booking RPCs (unchanged by this migration).

drop policy "Teachers can open slots on their own schedule when self-booking is allowed" on public.classes;
create policy "Teachers can open slots on their own schedule"
  on public.classes for insert
  to authenticated
  with check (
    teacher_id = public.my_teacher_org_chart_id()
    and company_code = public.my_org_chart_company_code()
    and student_id is null
  );

drop policy "Teachers can close open slots on their own schedule when self-booking is allowed" on public.classes;
create policy "Teachers can close open slots on their own schedule"
  on public.classes for delete
  to authenticated
  using (teacher_id = public.my_teacher_org_chart_id());

-- The old plain UPDATE policy let a teacher rewrite ANY column on their own
-- row via a raw API call (including student_id, bypassing the credit-safe
-- RPCs) whenever self-booking was allowed. Drop it and replace the one
-- thing teachers actually needed plain UPDATE for — marking their own
-- class completed — with a narrow RPC that can only ever flip Status to
-- 'Completed', nothing else. No teacher-facing UPDATE grant on classes is
-- needed at all any more.
drop policy "Teachers can update their own schedule when self-booking is allowed" on public.classes;

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

  update public.classes
  set "Status" = 'Completed', updated_at = now()
  where id = p_class_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.mark_class_completed(uuid) to authenticated;
