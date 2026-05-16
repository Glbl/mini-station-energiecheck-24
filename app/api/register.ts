import { NextRequest, NextResponse } from 'next/server';
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

// Preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET — conteo actual
export async function GET() {
  const { count, error } = await supabase
    .from('mini_station_leads')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  return NextResponse.json({ count: count ?? 0 }, { headers: corsHeaders });
}

// POST — nuevo lead
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, preferred_time } = body;

  if (!name || !email || !preferred_time) {
    return NextResponse.json(
      { error: 'Alle Felder sind erforderlich.' },
      { status: 400, headers: corsHeaders }
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
        { status: 409, headers: corsHeaders }
      );
    }
    return NextResponse.json(
      { error: insertError.message },
      { status: 500, headers: corsHeaders }
    );
  }

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

  return NextResponse.json(
    { success: true, is_free_offer: isFreeOffer },
    { headers: corsHeaders }
  );
}
