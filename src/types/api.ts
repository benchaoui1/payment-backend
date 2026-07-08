export type HealthResponse = {
  status: "ok";
  service: "payment-backend";
};

export type PayTestResponse = {
  status: "ok";
  message: "Payment API route is working";
};

export type SupabaseTestResponse = {
  status: "ok";
  count: number;
};

export type ErrorResponse = {
  status: "error";
  message: string;
};
