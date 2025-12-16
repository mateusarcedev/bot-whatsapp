-- Copy and paste this into your Supabase SQL Editor to create the necessary table

create table if not exists users (
  phone text primary key,
  name text,
  last_active timestamptz default now()
);

-- Optional: Enable Row Level Security (RLS) if you want to lock it down, 
-- but for a bot service account, standard access is fine.
alter table users enable row level security;
create policy "Enable all access for service role" on users using (true) with check (true);

-- Table for Baileys Session Auth (WhatsApp)
create table if not exists auth_sessions_baileys (
  key text primary key,
  value text
);
alter table auth_sessions_baileys enable row level security;
create policy "Enable all access for service role" on auth_sessions_baileys using (true) with check (true);
