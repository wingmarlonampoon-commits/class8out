-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Students page (add + edit forms) now captures a student's English
-- level (a CEFR-based pick list, see src/data/englishLevels.ts) and a free-text
-- description/bio. Neither column exists yet on student_lists.

alter table public.student_lists add column english_level character varying;
alter table public.student_lists add column description text;
