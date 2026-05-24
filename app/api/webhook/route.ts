import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PRODUCT_MAP: Record<string, string> = {
  '10880370475351': 'senioren',
  '10880370016599': 'single',
  '10880369525079': 'familien',
};

function verifyShopifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return hash === hmacHeader;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256') || '';

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const order = JSON.parse(rawBody);

  for (const item of order.line_items) {
    const productId = String(item.product_id);
    const packageName = PRODUCT_MAP[productId];

    if (packageName) {
      await supabase.rpc('increment_sales', { package: packageName });
    }
  }

  return NextResponse.json({ success: true });
}
