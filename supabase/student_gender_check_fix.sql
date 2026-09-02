-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- student_lists.gender has a check constraint that only allows 'Male' or
-- 'Female', but the Students page's Gender dropdown (Add + Edit forms) also
-- offers 'Other'. Selecting it fails the insert/update with a generic
-- "saving the student record failed" error (confirmed live: a probe insert
-- with gender='Other' throws check constraint "gender_check" violation).
-- Widen the constraint to match the UI instead of removing the option.

alter table public.student_lists drop constraint gender_check;

alter table public.student_lists add constraint gender_check
  check (gender in ('Male', 'Female', 'Other'));
