create table if not exists user_calendar_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  included_calendar_ids jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists user_calendar_preferences_set_updated_at on user_calendar_preferences;
create trigger user_calendar_preferences_set_updated_at
before update on user_calendar_preferences
for each row
execute function set_updated_at();
