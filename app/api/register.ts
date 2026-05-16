import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://energiecheck-24.myshopify.com',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // 1. Maneja el preflight CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).end();
  }

  // 2. Agrega CORS a todas las respuestas
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // 3. GET — devuelve el conteo actual
  if (req.method === 'GET') {
    const { count, error } = await supabase
      .from('mini_station_leads')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ count: count ?? 0 });
  }

  // 4. POST — registra un nuevo lead
  if (req.method === 'POST') {
    const { name, email, preferred_time } = req.body;

    // Validación básica
    if (!name || !email || !preferred_time) {
      return res.status(400).json({ error: 'Alle Felder sind erforderlich.' });
    }

    // Verifica el cap de 100
    const { count } = await supabase
      .from('mini_station_leads')
      .select('*', { count: 'exact', head: true });

    const isFreeOffer = (count ?? 0) < 100;

    // Inserta en Supabase
    const { error: insertError } = await supabase
      .from('mini_station_leads')
      .insert([{ name, email, preferred_time, is_free_offer: isFreeOffer }]);

    if (insertError) {
      // Email duplicado
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });
      }
      return res.status(500).json({ error: insertError.message });
    }

    // Envía email de notificación via Resend
    await resend.emails.send({
      from: 'Mini Station <tarif@energiecheck-24.de>',
      to: process.env.NOTIFICATION_EMAIL!,
      subject: `🎉 Neue Anmeldung: ${name}`,
      html: `
        <h2>Neue Mini Station Anmeldung</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>E-Mail:</strong> ${email}</p>
        <p><strong>Kontaktzeit:</strong> ${preferred_time}</p>
        <p><strong>Angebot:</strong> ${isFreeOffer ? '✅ Gratis-Paket' : '📩 Allgemeine Anfrage'}</p>
        <p><strong>Platz Nr.:</strong> ${(count ?? 0) + 1} von 100</p>
      `,
    });

    return res.status(200).json({
      success: true,
      is_free_offer: isFreeOffer,
      message: isFreeOffer
        ? 'Erfolgreich registriert! Sie erhalten das kostenlose Paket.'
        : 'Anfrage erhalten! Wir melden uns bei Ihnen.',
    });
  }

  // 5. Método no permitido
  return res.status(405).json({ error: 'Method not allowed' });
}
