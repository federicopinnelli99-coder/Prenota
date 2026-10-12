import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---- CONFIGURAZIONE: modificala a piacere ----
const DAYS = [2, 3, 4, 5, 6];   // giorni aperti: 0=dom 1=lun 2=mar ... 6=sab
const START = 9, END = 19;      // orario di apertura
const SLOT = 30;                // durata appuntamento in minuti
const BREAK = [13, 15];         // pausa pranzo (nessuno slot)
const CANCEL_HOURS = 24;        // ore minime prima dell'appuntamento per annullare online
const SERVICES = ['Taglio', 'Barba', 'Taglio + Barba'];
const TZ = 'Europe/Rome';
// -----------------------------------------------

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const nowLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date());
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isUuid = s => /^[0-9a-f-]{36}$/i.test(s || '');
const hoursUntil = (date, time) => (new Date(`${date}T${time}:00Z`) - new Date(nowLocal().replace(' ', 'T') + ':00Z')) / 36e5;

function allSlots(date) {
  if (!DAYS.includes(new Date(date + 'T00:00:00Z').getUTCDay())) return [];
  const out = [];
  for (let m = START * 60; m < END * 60; m += SLOT) {
    if (m >= BREAK[0] * 60 && m < BREAK[1] * 60) continue;
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  return out;
}
const isAdmin = req => !!process.env.ADMIN_PASSWORD && req.headers.get('x-password') === process.env.ADMIN_PASSWORD;

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
      if (!b.name?.trim() || !SERVICES.includes(b.service)) return json({ error: 'Nome e servizio sono obbligatori' }, 400);
      if (String(b.phone || '').replace(/\D/g, '').length < 6) return json({ error: 'Inserisci un numero di telefono valido' }, 400);
      const { data, error } = await db.from('bookings').insert({
        date: b.date, time: b.time, name: b.name.trim().slice(0, 100), phone: b.phone.trim().slice(0, 30),
        email: (b.email || '').trim().slice(0, 150) || '-', service: b.service, notes: (b.notes || '').slice(0, 500) || null
      }).select('token').single();
      if (error?.code === '23505') return json({ error: 'Questo orario è appena stato prenotato, scegline un altro' }, 409);
      if (error) throw error;
      return json({ ok: true, token: data.token }, 201);
    }
    if (route === 'manage') {
      const c = url.searchParams.get('c');
      if (!isUuid(c)) return json({ error: 'Link non valido' }, 400);
      const { data: b } = await db.from('bookings').select('date,time,name,service').eq('token', c).maybeSingle();
      if (!b) return json({ error: 'Prenotazione non trovata (forse già annullata)' }, 404);
      const canCancel = hoursUntil(b.date, b.time) >= CANCEL_HOURS;
      if (req.method === 'GET') return json({ ...b, canCancel, cancelHours: CANCEL_HOURS });
      if (req.method === 'DELETE') {
        if (!canCancel) return json({ error: `Non è più possibile annullare online (meno di ${CANCEL_HOURS} ore). Contattaci.` }, 403);
        const { error } = await db.from('bookings').delete().eq('token', c);
        if (error) throw error;
        return json({ ok: true });
      }
    }
    if (route === 'admin') {
      if (!isAdmin(req)) return json({ error: 'Password errata' }, 401);
      if (req.method === 'GET') {
        const { data, error } = await db.from('bookings').select('*').gte('date', nowLocal().slice(0, 10)).order('date').order('time');
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
