create table if not exists user_scheduling_contexts (
  user_id uuid primary key references users(id) on delete cascade,
  work_hours jsonb not null default '[]'::jsonb,
  no_schedule_windows jsonb not null default '[]'::jsonb,
  sleep_window jsonb,
  max_work_end_time text,
  preferred_focus_block_minutes integer,
  preferred_work_periods jsonb not null default '[]'::jsonb,
  recovery_days jsonb not null default '[]'::jsonb,
  additional_notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists scheduling_preference_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (
    kind in (
      'work_hours',
      'no_schedule_window',
      'sleep_window',
      'latest_work_end',
      'preferred_focus_block',
      'preferred_work_period',
      'recovery_day',
      'custom'
    )
  ),
  title text not null,
  detail text not null default '',
  source text not null default 'derived' check (
    source in ('user', 'derived')
  ),
  strength text not null check (
    strength in ('hard_constraint', 'soft_preference')
  ),
  status text not null default 'suggested' check (
    status in ('active', 'suggested', 'dismissed')
  ),
  confidence text check (
    confidence in ('low', 'medium', 'high')
  ),
  context_patch jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduling_preference_suggestions_user_id_status_idx
  on scheduling_preference_suggestions (user_id, status, created_at desc);

drop trigger if exists user_scheduling_contexts_set_updated_at on user_scheduling_contexts;
create trigger user_scheduling_contexts_set_updated_at
before update on user_scheduling_contexts
for each row
execute function set_updated_at();

drop trigger if exists scheduling_preference_suggestions_set_updated_at on scheduling_preference_suggestions;
create trigger scheduling_preference_suggestions_set_updated_at
before update on scheduling_preference_suggestions
for each row
execute function set_updated_at();
