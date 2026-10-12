create table bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text not null,
  name text not null,
  email text not null,
  phone text,
  notes text,
  created_at timestamptz default now(),
  unique (date, time)   -- impedisce due prenotazioni sullo stesso orario
);
-- RLS attivo e nessuna policy: dal browser nessuno può leggere la tabella.
-- Solo le Netlify Functions (con la chiave segreta) possono accedervi.
alter table bookings enable row level security;
