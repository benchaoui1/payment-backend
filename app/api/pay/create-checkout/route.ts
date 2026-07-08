import type { CreateCheckoutRequestBody, CreateCheckoutSuccessResponse } from "@/types/api";
import { jsonBadRequest, jsonNotFound, jsonOk, jsonServerError } from "@/utils/api-response";
import { ALLOWED_ADDON_CODES, computeAmountCents } from "@/lib/pricing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = "23505"; // Postgres error code for a unique constraint violation

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
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

  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
  const orderReference = typeof metadata.order_reference === "string" ? metadata.order_reference.trim() : "";
  if (!orderReference) return jsonBadRequest("`metadata.order_reference` is required.");

  try {
    const { supabaseAdmin } = await import("@/lib/supabase");

    /* -------------------------------------------------------------------
       2) Load the selected product from payment_products.
       ------------------------------------------------------------------- */
    const { data: product, error: productError } = await supabaseAdmin
      .from("payment_products")
      .select("product_code, website, success_redirect_url, cancel_redirect_url")
      .eq("product_code", productCode)
      .eq("website", website)
      .eq("active", true)
      .maybeSingle();

    if (productError) return jsonServerError(productError.message);
    if (!product) {
      return jsonNotFound(`No active product found for product_code "${productCode}" and website "${website}".`);
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
      metadata,
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
       6) Return the created order. No Stripe session is created here.
       ------------------------------------------------------------------- */
    return jsonOk<CreateCheckoutSuccessResponse>({
      success: true,
      order_reference: order.order_reference,
      order_id: order.id,
      status: order.status,
    });
  } catch (error) {
    return jsonServerError(getErrorMessage(error));
  }
}
