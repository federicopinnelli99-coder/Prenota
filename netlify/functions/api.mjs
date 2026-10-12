import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---- CONFIGURAZIONE: modificala a piacere ----
const START = 9, END = 18;      // orario di apertura (Lun-Ven)
const SLOT = 30;                // durata appuntamento in minuti
const BREAK = [13, 14];         // pausa pranzo (nessuno slot)
const TZ = 'Europe/Rome';
// -----------------------------------------------

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const nowLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date());
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

function allSlots(date) {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  if (day === 0 || day === 6) return [];
  const out = [];
  for (let m = START * 60; m < END * 60; m += SLOT) {
    if (m >= BREAK[0] * 60 && m < BREAK[1] * 60) continue;
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  return out;
}
const isAdmin = req => req.headers.get('x-password') === process.env.ADMIN_PASSWORD && !!process.env.ADMIN_PASSWORD;

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace('/api/', '');
  try {
    if (route === 'slots' && req.method === 'GET') {
      const date = url.searchParams.get('date');
      if (!isDate(date)) return json({ error: 'Data non valida' }, 400);
      const { data, error } = await db.from('bookings').select('time').eq('date', date);
      if (error) throw error;
      const taken = new Set(data.map(r => r.time));
      return json(allSlots(date).filter(t => !taken.has(t) && `${date} ${t}` > nowLocal()));
    }
    if (route === 'book' && req.method === 'POST') {
      const b = await req.json();
      if (!isDate(b.date) || !allSlots(b.date).includes(b.time) || `${b.date} ${b.time}` <= nowLocal())
        return json({ error: 'Orario non disponibile' }, 400);
      if (!b.name?.trim() || !/^\S+@\S+\.\S+$/.test(b.email || '')) return json({ error: 'Nome ed email validi sono obbligatori' }, 400);
      const { error } = await db.from('bookings').insert({
        date: b.date, time: b.time, name: b.name.trim().slice(0, 100), email: b.email.trim().slice(0, 150),
        phone: (b.phone || '').slice(0, 30) || null, notes: (b.notes || '').slice(0, 500) || null });
      if (error?.code === '23505') return json({ error: 'Questo orario è appena stato prenotato, scegline un altro' }, 409);
      if (error) throw error;
      return json({ ok: true }, 201);
    }
    if (route === 'admin') {
      if (!isAdmin(req)) return json({ error: 'Password errata' }, 401);
      if (req.method === 'GET') {
        const today = nowLocal().slice(0, 10);
        const { data, error } = await db.from('bookings').select('*').gte('date', today).order('date').order('time');
        if (error) throw error;
        return json(data);
      }
      if (req.method === 'DELETE') {
        const { error } = await db.from('bookings').delete().eq('id', url.searchParams.get('id'));
        if (error) throw error;
        return json({ ok: true });
      }
    }
    return json({ error: 'Non trovato' }, 404);
  } catch (e) {
    return json({ error: 'Errore del server' }, 500);
  }
};
export const config = { path: '/api/*' };
