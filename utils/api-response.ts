import { NextResponse } from "next/server";

import type { ErrorResponse } from "@/types/api";

export function jsonOk<TBody extends object>(body: TBody) {
  return NextResponse.json(body, {
    status: 200,
  });
}

function jsonError(status: number, message: string) {
  const body: ErrorResponse = {
    status: "error",
    message,
  };

  return NextResponse.json(body, {
    status,
  });
}

export function jsonServerError(message = "Internal server error") {
  return jsonError(500, message);
}

export function jsonBadRequest(message: string) {
  return jsonError(400, message);
}

export function jsonNotFound(message: string) {
  return jsonError(404, message);
}
