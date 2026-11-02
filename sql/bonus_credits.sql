alter table public.student_lessons
  add column if not exists bonus_credits integer not null default 0;
