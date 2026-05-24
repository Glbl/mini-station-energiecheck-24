import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function GET() {
  const { data, error } = await supabase
    .from('package_sales')
    .select('package_name, sold');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: getCorsHeaders() });
  }

  const result: Record<string, number> = {};
  for (const row of data) {
    result[row.package_name] = row.sold;
  }

  return NextResponse.json(result, { headers: getCorsHeaders() });
}
