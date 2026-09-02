-- Run once via: npx supabase db query --linked -f supabase/freelance_tables.sql
-- Run AFTER freelance_teachers_rls.sql (depends on my_freelance_teacher_id()).
--
-- Freelance teachers are intentionally isolated from the company schema.
-- These three tables mirror student_lists/books/classes minus
-- company-specific columns, scoped by teacher_id instead of company_code.
-- No multi-admin sharing here, so RLS is a flat "row belongs to me" check.
-- Column casing ("Credits", "Status") mirrors student_lists/classes so the
-- same TS row shapes and rendering code can be reused across both branches.

create table public.freelance_students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.freelance_teachers(id) on delete cascade,
  name text not null,
  gender text,
  email varchar,
  subject jsonb,
  contact jsonb,
  books jsonb,
  student_code text not null,
  english_level text,
  description text,
  "Credits" numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index freelance_students_teacher_idx on public.freelance_students (teacher_id);
alter table public.freelance_students enable row level security;

create policy "Freelance teachers can view their own students"
  on public.freelance_students for select to authenticated
  using (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can add their own students"
  on public.freelance_students for insert to authenticated
  with check (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can update their own students"
  on public.freelance_students for update to authenticated
  using (teacher_id = public.my_freelance_teacher_id())
  with check (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can delete their own students"
  on public.freelance_students for delete to authenticated
  using (teacher_id = public.my_freelance_teacher_id());

-- Freelance books are always private to their owner (no cross-teacher
-- public marketplace for freelancers in this pass).
create table public.freelance_books (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.freelance_teachers(id) on delete cascade,
  title text not null,
  description text,
  subject text not null,
  category text not null,
  book_url text not null,
  created_at timestamptz not null default now()
);

create index freelance_books_teacher_idx on public.freelance_books (teacher_id);
alter table public.freelance_books enable row level security;

create policy "Freelance teachers can view their own books"
  on public.freelance_books for select to authenticated
  using (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can add their own books"
  on public.freelance_books for insert to authenticated
  with check (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can update their own books"
  on public.freelance_books for update to authenticated
  using (teacher_id = public.my_freelance_teacher_id())
  with check (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can delete their own books"
  on public.freelance_books for delete to authenticated
  using (teacher_id = public.my_freelance_teacher_id());

-- Mirrors public.classes' derived-state design: no row = closed, row with
-- student_id null = open, row with student_id set = booked.
create table public.freelance_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.freelance_teachers(id) on delete cascade,
  student_id uuid references public.freelance_students(id) on delete set null,
  date date not null,
  start_time time not null,
  "Status" text not null default 'Booked',
  class_details jsonb,
  class_notes text,
  class_recording text,
  teacher_rating numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freelance_classes_status_check check ("Status" in ('Booked', 'Completed')),
  constraint freelance_classes_rating_check check (teacher_rating is null or (teacher_rating >= 0 and teacher_rating <= 5)),
  constraint freelance_classes_teacher_date_start_time_key unique (teacher_id, date, start_time)
);

create index freelance_classes_teacher_date_idx on public.freelance_classes (teacher_id, date);
create index freelance_classes_student_idx on public.freelance_classes (student_id) where student_id is not null;
alter table public.freelance_classes enable row level security;

-- Freelance teachers always have full, ungated CRUD on their own schedule
-- (no teacher_self_booking concept applies — they have no employer).
create policy "Freelance teachers can view their own schedule"
  on public.freelance_classes for select to authenticated
  using (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can open slots on their own schedule"
  on public.freelance_classes for insert to authenticated
  with check (teacher_id = public.my_freelance_teacher_id() and student_id is null);
create policy "Freelance teachers can update their own schedule"
  on public.freelance_classes for update to authenticated
  using (teacher_id = public.my_freelance_teacher_id())
  with check (teacher_id = public.my_freelance_teacher_id());
create policy "Freelance teachers can close open slots on their own schedule"
  on public.freelance_classes for delete to authenticated
  using (teacher_id = public.my_freelance_teacher_id());
