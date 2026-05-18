import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://energiecheck-24.myshopify.com',
  'https://admin.shopify.com',
];

function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const { count, error } = await supabase
    .from('mini_station_leads')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders(req) });
  }

  return NextResponse.json({ count: count ?? 0 }, { headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY_2!);

  const body = await req.json();
  const { name, email, preferred_time } = body;

  if (!name || !email || !preferred_time) {
    return NextResponse.json(
      { error: 'Alle Felder sind erforderlich.' },
      { status: 400, headers: getCorsHeaders(req) }
    );
  }

  const { count } = await supabase
    .from('mini_station_leads')
    .select('*', { count: 'exact', head: true });

  const isFreeOffer = (count ?? 0) < 100;

  const { error: insertError } = await supabase
    .from('mini_station_leads')
    .insert([{ name, email, preferred_time, is_free_offer: isFreeOffer }]);

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Diese E-Mail ist bereits registriert.' },
        { status: 409, headers: getCorsHeaders(req) }
      );
    }
    return NextResponse.json(
      { error: insertError.message },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }

  await resend.emails.send({
    from: 'Mini Station <tarif@energiecheck-24.de>',
    to: process.env.NOTIFY_EMAIL!,
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

  await resend.emails.send({
    from: 'Energiecheck 24 <noreply@energiecheck-24.de>',
    to: email,
    subject: '✅ Ihre Anmeldung wurde erhalten – Mini Station',
    html: `
      <h2>Hallo ${name},</h2>
      <p>Vielen Dank für Ihre Anmeldung zum kostenlosen Mini Station Testprogramm!</p>
      ${isFreeOffer
        ? `<p>🎉 <strong>Glückwunsch!</strong> Sie gehören zu den ersten 100 Teilnehmern und erhalten das komplette Paket kostenlos.</p>`
        : `<p>Wir haben Ihre Anfrage erhalten und melden uns so bald wie möglich bei Ihnen.</p>`
      }
      <p><strong>Ihre Angaben:</strong></p>
      <ul>
        <li>Name: ${name}</li>
        <li>Bevorzugte Kontaktzeit: ${preferred_time}</li>
      </ul>
      <p>Mit freundlichen Grüßen,<br>Das Energiecheck-24 Team</p>
    `,
  });

  return NextResponse.json(
    { success: true, is_free_offer: isFreeOffer },
    { headers: getCorsHeaders(req) }
  );
}
