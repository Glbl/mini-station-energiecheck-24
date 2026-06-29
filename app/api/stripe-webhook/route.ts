import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PRICE_MAP: Record<string, { package: string; inventoryItemId: string; quantity: number }> = {
  'price_FAMILIEN_ID':  { package: 'familien',  inventoryItemId: 'INVENTORY_ITEM_ID_FAMILIEN',  quantity: 1 },
  'price_SINGLE_ID':   { package: 'single',     inventoryItemId: 'INVENTORY_ITEM_ID_SINGLE',    quantity: 1 },
  'price_SENIOREN_ID': { package: 'senioren',   inventoryItemId: 'INVENTORY_ITEM_ID_SENIOREN',  quantity: 1 },
};

async function adjustShopifyInventory(inventoryItemId: string, delta: number) {
  const locationRes = await fetch(
    `https://energiecheck-24.myshopify.com/admin/api/2026-04/locations.json`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN! } }
  );
  const locationData = await locationRes.json();
  const locationId = locationData.locations[0].id;

  await fetch(
    `https://energiecheck-24.myshopify.com/admin/api/2026-04/inventory_levels/adjust.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: delta, // negativo para reducir
      }),
    }
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    for (const item of lineItems.data) {
      const priceId = item.price?.id || '';
      const mapped = PRICE_MAP[priceId];
      const qty = item.quantity || 1;

      if (mapped) {
        // 1 — Actualizar Supabase
        for (let i = 0; i < qty; i++) {
          await supabase.rpc('increment_sales', { package: mapped.package });
        }

        // 2 — Reducir stock en Shopify
        await adjustShopifyInventory(mapped.inventoryItemId, -qty);
      }
    }
  }

  return NextResponse.json({ received: true });
}
