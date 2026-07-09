import { NextResponse } from "next/server";
import Stripe from "stripe";

/* =========================================================================
   POST /api/pay/create-checkout
   -------------------------------------------------------------------------
   Fully self-contained on purpose: after two build failures caused by this
   route depending on other files (api-response.ts, types/api.ts,
   lib/pricing.ts) that weren't actually present at the expected path in
   the repo, EVERYTHING this route needs — response helpers, types, and
   the temporary pricing table — is defined right here. The only project
   import left is @/lib/supabase, which already exists and already works
   (it's used by your other routes).
   ========================================================================= */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = "23505"; // Postgres error code for a unique constraint violation

// TEST mode Stripe client. STRIPE_SECRET_KEY must be a Vercel env var (a
// sk_test_... key while we're not live yet) — never hardcoded, never sent
// to the frontend. No apiVersion pinned here on purpose: stripe-node uses
// the version current at the time of the installed package's release,
// which is the simplest correct default for a fresh integration.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

/* ---------------------------------------------------------------------
   CORS — allow the WorldIDP frontend to call this endpoint from the
   browser. Applied to every response this route returns, including
   errors, plus a dedicated OPTIONS handler for the preflight request.
   --------------------------------------------------------------------- */
const ALLOWED_ORIGIN = "https://worldidp.vercel.app";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/* ---------------------------------------------------------------------
   TEMPORARY internal pricing table.
   -----------------------------------------------------------------------
   `payment_products` does not currently store a price — only a
   `stripe_price_id` (a Stripe Price reference). Resolving the real amount
   from that would require the Stripe SDK, which this step must not add.
   Adding a price column to the schema is also out of scope right now.

   TODO: once either of these becomes possible —
     (a) resolve amount from Stripe via each product's stripe_price_id, or
     (b) read a price/amount column added to payment_products —
   replace PRODUCT_BASE_AMOUNTS_CENTS/ADDON_AMOUNTS_CENTS below. Nothing
   else in this route needs to change; only computeAmountCents() and the
   two tables below are pricing-specific.
   --------------------------------------------------------------------- */
const PRODUCT_BASE_AMOUNTS_CENTS: Record<string, number> = {
  digital_1y: 4900,
  digital_2y: 5500,
  digital_3y: 5900,
  print_1y: 7900,
  print_2y: 8900,
  print_3y: 9900,
};

const ADDON_AMOUNTS_CENTS: Record<string, number> = {
  express_processing: 1400,
};

const ALLOWED_ADDON_CODES = Object.keys(ADDON_AMOUNTS_CENTS);

function computeAmountCents(productCode: string, addons: string[]): number | null {
  const base = PRODUCT_BASE_AMOUNTS_CENTS[productCode];
  if (base == null) return null;
  const addonsTotal = addons.reduce((sum, code) => sum + (ADDON_AMOUNTS_CENTS[code] ?? 0), 0);
  return base + addonsTotal;
}

/* ---------------------------------------------------------------------
   Request/response shapes + tiny JSON response helpers, local to this
   route so it can never fail to build over a missing shared export.
   --------------------------------------------------------------------- */
type CreateCheckoutRequestBody = {
  website?: unknown;
  product_code?: unknown;
  addons?: unknown;
  customer_email?: unknown;
  metadata?: unknown;
};

type CreateCheckoutSuccessResponse = {
  success: true;
  order_reference: string;
  order_id: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  checkout_url?: string;
};

type ErrorResponseBody = {
  status: "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function jsonOk<TBody extends object>(body: TBody) {
  return NextResponse.json(body, { status: 200, headers: CORS_HEADERS });
}

function jsonBadRequest(message: string) {
  const body: ErrorResponseBody = { status: "error", message };
  return NextResponse.json(body, { status: 400, headers: CORS_HEADERS });
}

function jsonNotFound(message: string) {
  const body: ErrorResponseBody = { status: "error", message };
  return NextResponse.json(body, { status: 404, headers: CORS_HEADERS });
}

function jsonServerError(message = "Internal server error") {
  const body: ErrorResponseBody = { status: "error", message };
  return NextResponse.json(body, { status: 500, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  let body: CreateCheckoutRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("Request body must be valid JSON.");
  }

  /* ---------------------------------------------------------------------
     1) Validate the incoming payload.
     --------------------------------------------------------------------- */
  const website = typeof body.website === "string" ? body.website.trim() : "";
  if (!website) return jsonBadRequest("`website` is required.");

  const productCode = typeof body.product_code === "string" ? body.product_code.trim() : "";
  if (!productCode) return jsonBadRequest("`product_code` is required.");

  let addons: string[] = [];
  if (body.addons !== undefined) {
    if (!Array.isArray(body.addons)) {
      return jsonBadRequest("`addons` must be an array.");
    }
    addons = body.addons;
    for (const addon of addons) {
      if (typeof addon !== "string" || !ALLOWED_ADDON_CODES.includes(addon)) {
        return jsonBadRequest(`Unknown addon: ${String(addon)}`);
      }
    }
  }

  let customerEmail: string | null = null;
  if (typeof body.customer_email === "string" && body.customer_email.trim() !== "") {
    const trimmed = body.customer_email.trim();
    if (!EMAIL_RE.test(trimmed)) return jsonBadRequest("`customer_email` is not a valid email address.");
    customerEmail = trimmed;
  }

  const metadataInput =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};
  const orderReference =
    typeof metadataInput.order_reference === "string" ? metadataInput.order_reference.trim() : "";
  if (!orderReference) return jsonBadRequest("`metadata.order_reference` is required.");

  try {
    const { supabaseAdmin } = await import("@/lib/supabase");

    /* -------------------------------------------------------------------
       2) Load the selected product from payment_products.
       ------------------------------------------------------------------- */
    const { data: product, error: productError } = await supabaseAdmin
      .from("payment_products")
      .select("product_code, website, success_redirect_url, cancel_redirect_url, stripe_price_id")
      .eq("product_code", productCode)
      .eq("website", website)
      .eq("active", true)
      .maybeSingle();

    if (productError) return jsonServerError(productError.message);
    if (!product) {
      return jsonNotFound(`No active product found for product_code "${productCode}" and website "${website}".`);
    }

    if (!product.stripe_price_id || product.stripe_price_id.startsWith("mock_")) {
      return jsonServerError("Payment isn't fully configured for this product yet. Please try again shortly.");
    }

    const amount = computeAmountCents(productCode, addons);
    if (amount == null) {
      // Server-side configuration gap (missing price entry), not a bad request.
      return jsonServerError(`No price configured for product_code "${productCode}".`);
    }

    /* -------------------------------------------------------------------
       3-5) Create the pending row in payment_orders.
       ------------------------------------------------------------------- */
    const row = {
      order_reference: orderReference,
      product_code: product.product_code,
      website: product.website,
      customer_email: customerEmail,
      status: "pending" as const,
      amount,
      // TODO: `payment_products` has no currency column yet, so this is
      // hardcoded. Once a currency column is added there (or currency is
      // resolved from each product's Stripe Price), read it from the
      // product row instead of hardcoding "usd" here.
      currency: "usd",
      metadata: metadataInput,
      success_redirect_url: product.success_redirect_url,
      cancel_redirect_url: product.cancel_redirect_url,
    };

    const { data: order, error: insertError } = await supabaseAdmin
      .from("payment_orders")
      .insert(row)
      .select("id, order_reference, status")
      .single();

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        // Same order_reference submitted twice (e.g. a client retry) — return
        // the existing row instead of failing, so this call is safely repeatable.
        const { data: existing, error: fetchError } = await supabaseAdmin
          .from("payment_orders")
          .select("id, order_reference, status")
          .eq("order_reference", orderReference)
          .single();

        if (fetchError || !existing) {
          return jsonServerError("Order reference already exists but the existing order could not be loaded.");
        }

        return jsonOk<CreateCheckoutSuccessResponse>({
          success: true,
          order_reference: existing.order_reference,
          order_id: existing.id,
          status: existing.status,
        });
      }
      return jsonServerError(insertError.message);
    }

    /* -------------------------------------------------------------------
       6) Create the Stripe Checkout Session (TEST mode) for the new order,
          using only the existing stripe_price_id — no price_data, no
          Payment Links. Then record the session id on the order.
       ------------------------------------------------------------------- */
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: product.stripe_price_id, quantity: 1 }],
      customer_email: customerEmail || undefined,
      success_url: product.success_redirect_url + "?order_reference=" + order.order_reference,
      cancel_url: product.cancel_redirect_url + "?order_reference=" + order.order_reference,
      metadata: {
        order_id: order.id,
        order_reference: order.order_reference,
        product_code: product.product_code,
        website: product.website,
        application_id: (metadataInput.application_id as string | undefined) || "",
      },
    });

    const { error: sessionUpdateError } = await supabaseAdmin
      .from("payment_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);
    if (sessionUpdateError) {
      // Not fatal — the customer can still pay via session.url even if this
      // bookkeeping write fails. Log it so it isn't silently lost.
      console.error("[create-checkout] failed to save stripe_session_id:", sessionUpdateError.message);
    }

    /* -------------------------------------------------------------------
       7) Return the created order plus the Stripe Checkout URL.
       ------------------------------------------------------------------- */
    return jsonOk<CreateCheckoutSuccessResponse>({
      success: true,
      order_reference: order.order_reference,
      order_id: order.id,
      status: order.status,
      checkout_url: session.url || undefined,
    });
  } catch (error) {
    return jsonServerError(getErrorMessage(error));
  }
}
