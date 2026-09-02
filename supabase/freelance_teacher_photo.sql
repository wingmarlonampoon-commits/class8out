-- Run once via: npx supabase db query --linked -f supabase/freelance_teacher_photo.sql
--
-- Teachers get a self-service "Your Profile" panel (photo, intro video,
-- intro message, subjects, contacts) on TeacherDashboard/Settings.tsx.
-- company_organizational_chart already has a photo column (admin-managed
-- today, self-editable via the existing "Employees can update their own
-- org chart row" policy); freelance_teachers has everything else
-- (intro_video, intro_message, subject, "Contact") but no photo column.

alter table public.freelance_teachers add column photo text;
