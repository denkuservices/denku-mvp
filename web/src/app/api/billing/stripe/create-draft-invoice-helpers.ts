import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Initialize Stripe client (throws if STRIPE_SECRET_KEY missing).
 */
export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

/**
 * Ensure Stripe customer exists for org_id.
 * Creates customer if missing and stores mapping in billing_stripe_customers.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  orgId: string
): Promise<string> {
  // Check existing mapping
  const { data: existing } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    name: orgId, // Use org_id as name (no email required)
    metadata: {
      org_id: orgId,
    },
  });

  // Store mapping
  await supabaseAdmin
    .from("billing_stripe_customers")
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: customer.id,
      },
      {
        onConflict: "org_id",
      }
    );

  return customer.id;
}
