import type { SupabaseTestResponse } from "@/types/api";
import { jsonOk, jsonServerError } from "@/utils/api-response";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { count, error } = await supabaseAdmin
      .from("payment_products")
      .select("*", { count: "exact", head: true });

    if (error) {
      return jsonServerError(error.message);
    }

    return jsonOk<SupabaseTestResponse>({
      status: "ok",
      count: count ?? 0,
    });
  } catch (error) {
    return jsonServerError(getErrorMessage(error));
  }
}
