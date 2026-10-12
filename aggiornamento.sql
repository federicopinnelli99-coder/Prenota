-- Da eseguire UNA volta nel SQL Editor di Supabase
alter table bookings add column token uuid not null default gen_random_uuid() unique;
alter table bookings add column service text;
