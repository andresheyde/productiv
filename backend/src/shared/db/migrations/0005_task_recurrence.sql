alter table tasks
  add column if not exists recurrence jsonb;
