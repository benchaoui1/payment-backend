import { SERVICE_NAME } from "@/lib/service";
import type { HealthResponse } from "@/types/api";
import { jsonOk, jsonServerError } from "@/utils/api-response";

export function GET() {
  try {
    return jsonOk<HealthResponse>({
      status: "ok",
      service: SERVICE_NAME,
    });
  } catch {
    return jsonServerError();
  }
}
