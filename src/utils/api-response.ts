import { NextResponse } from "next/server";

import type { ErrorResponse } from "@/types/api";

export function jsonOk<TBody extends object>(body: TBody) {
  return NextResponse.json(body, {
    status: 200,
  });
}

export function jsonServerError(message = "Internal server error") {
  const body: ErrorResponse = {
    status: "error",
    message,
  };

  return NextResponse.json(body, {
    status: 500,
  });
}
