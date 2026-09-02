-- Run once via: npx supabase db query --linked -f supabase/student_view_classes.sql
-- Run AFTER student_view_teachers.sql.
--
-- A student needs to see a whole teacher's weekly grid (open vs. booked vs.
-- closed) to browse and book a slot -- not just their own booked rows. This
-- grants a company student read access to their WHOLE company's schedule
-- (every teacher, every slot), same breadth the admin already has. Other
-- students' bookings only ever expose an opaque student_id (a UUID) --
-- students' own read access to student_lists stays scoped to their own row
-- (student_lists_rls.sql), so no other student's name/details are ever
-- resolvable from that UUID. The frontend never attempts to resolve it for
-- slots that aren't the viewing student's own.
--
-- A freelance student only ever has one teacher, so their equivalent grant
-- is scoped to that teacher's whole schedule.

create policy "Students can view their company's schedule"
  on public.classes for select
  to authenticated
  using (
    company_code in (
      select sl.company_code from public.student_lists sl
      where sl.email = auth.jwt() ->> 'email'
    )
  );

create policy "Students can view their freelance teacher's schedule"
  on public.freelance_classes for select
  to authenticated
  using (
    exists (
      select 1 from public.freelance_students fs
      where fs.teacher_id = freelance_classes.teacher_id
        and fs.email = auth.jwt() ->> 'email'
    )
  );
