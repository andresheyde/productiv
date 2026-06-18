create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_subject text not null unique,
  email text,
  full_name text,
  avatar_url text,
  session_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  definition text not null default '',
  success_criteria jsonb not null default '[]'::jsonb,
  priority_rank integer not null default 100,
  status text not null default 'active' check (
    status in ('active', 'paused', 'completed', 'archived')
  ),
  habit_focus jsonb not null default '[]'::jsonb,
  schedule_guidance jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default 'New thread',
  current_intent text,
  latest_context_summary text not null default '',
  latest_artifact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  thread_id uuid references assistant_threads(id) on delete set null,
  title text not null default 'Schedule proposal',
  status text not null default 'draft' check (
    status in ('draft', 'confirmed', 'applied', 'superseded', 'canceled')
  ),
  intent text,
  date_range_start date,
  date_range_end date,
  summary text not null default '',
  operations jsonb not null default '[]'::jsonb,
  conflict_annotations jsonb not null default '[]'::jsonb,
  feedback_history jsonb not null default '[]'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  linked_proposal_id uuid references schedule_proposals(id) on delete set null,
  title text not null,
  description text not null default '',
  priority_rank integer not null default 100,
  status text not null default 'inbox' check (
    status in ('inbox', 'planned', 'scheduled', 'done', 'canceled')
  ),
  estimated_minutes integer,
  due_at timestamptz,
  flexibility text check (
    flexibility in ('fixed', 'flexible', 'very_flexible')
  ),
  preferred_windows jsonb not null default '[]'::jsonb,
  linked_calendar_event_id text,
  schedule_intent text not null default 'unscheduled' check (
    schedule_intent in ('unscheduled', 'schedule_now', 'someday')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  intent text,
  content text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists schedule_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  timeframe_start date not null,
  timeframe_end date not null,
  user_narrative text not null,
  extracted_blockers jsonb not null default '[]'::jsonb,
  effective_conditions jsonb not null default '[]'::jsonb,
  recurring_preferences jsonb not null default '[]'::jsonb,
  recommended_memory_updates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists user_context_memory (
  user_id uuid primary key references users(id) on delete cascade,
  priority_summary jsonb not null default '[]'::jsonb,
  preferred_work_windows jsonb not null default '[]'::jsonb,
  no_go_times jsonb not null default '[]'::jsonb,
  recurring_blockers jsonb not null default '[]'::jsonb,
  helpful_interventions jsonb not null default '[]'::jsonb,
  raw_summary text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists goals_user_id_priority_idx
  on goals (user_id, priority_rank, status);

create index if not exists tasks_user_id_status_priority_idx
  on tasks (user_id, status, priority_rank);

create index if not exists assistant_threads_user_id_updated_at_idx
  on assistant_threads (user_id, updated_at desc);

create index if not exists assistant_messages_thread_id_created_at_idx
  on assistant_messages (thread_id, created_at asc);

create index if not exists schedule_proposals_user_id_status_created_at_idx
  on schedule_proposals (user_id, status, created_at desc);

create index if not exists schedule_reflections_user_id_created_at_idx
  on schedule_reflections (user_id, created_at desc);

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row
execute function set_updated_at();

drop trigger if exists goals_set_updated_at on goals;
create trigger goals_set_updated_at
before update on goals
for each row
execute function set_updated_at();

drop trigger if exists assistant_threads_set_updated_at on assistant_threads;
create trigger assistant_threads_set_updated_at
before update on assistant_threads
for each row
execute function set_updated_at();

drop trigger if exists schedule_proposals_set_updated_at on schedule_proposals;
create trigger schedule_proposals_set_updated_at
before update on schedule_proposals
for each row
execute function set_updated_at();

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
before update on tasks
for each row
execute function set_updated_at();

drop trigger if exists user_context_memory_set_updated_at on user_context_memory;
create trigger user_context_memory_set_updated_at
before update on user_context_memory
for each row
execute function set_updated_at();
