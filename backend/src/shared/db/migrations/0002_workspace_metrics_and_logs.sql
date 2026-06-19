create table if not exists goal_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  name text not null,
  unit_label text not null,
  target_value double precision not null check (target_value > 0),
  current_value double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  thread_id uuid references assistant_threads(id) on delete set null,
  goal_id uuid references goals(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  raw_text text not null,
  summary text not null default '',
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists metric_progress_entries (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references goal_metrics(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  work_log_id uuid references work_logs(id) on delete set null,
  delta_value double precision not null,
  source text not null check (
    source in ('assistant_extract', 'manual')
  ),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists goal_metrics_user_id_goal_id_idx
  on goal_metrics (user_id, goal_id, is_active);

create index if not exists metric_progress_entries_metric_id_created_at_idx
  on metric_progress_entries (metric_id, created_at desc);

create index if not exists work_logs_user_id_recorded_at_idx
  on work_logs (user_id, recorded_at desc);

drop trigger if exists goal_metrics_set_updated_at on goal_metrics;
create trigger goal_metrics_set_updated_at
before update on goal_metrics
for each row
execute function set_updated_at();

drop trigger if exists work_logs_set_updated_at on work_logs;
create trigger work_logs_set_updated_at
before update on work_logs
for each row
execute function set_updated_at();
