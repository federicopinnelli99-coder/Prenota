// Ogni giorno fa una piccola lettura: evita la pausa del progetto Supabase gratuito (7 giorni di inattività)
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
export default async () => { await db.from('bookings').select('id').limit(1); };
export const config = { schedule: '@daily' };
