-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- The Books page needs a Title (what shows in the roster instead of just
-- Subject/Category) and an optional Description. No existing rows in
-- `books` yet, so title can be added as NOT NULL directly.

alter table public.books add column title text not null default '';
alter table public.books alter column title drop default;
alter table public.books add column description text;
