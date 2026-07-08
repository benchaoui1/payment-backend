import type { PayTestResponse } from "@/types/api";
import { jsonOk, jsonServerError } from "@/utils/api-response";

export function GET() {
  try {
    return jsonOk<PayTestResponse>({
      status: "ok",
      message: "Payment API route is working",
    });
  } catch {
    return jsonServerError();
  }
}
