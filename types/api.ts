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

export type CreateCheckoutRequestBody = {
  website: string;
  product_code: string;
  addons?: string[];
  customer_email?: string | null;
  metadata?: {
    source?: string;
    frontend_version?: string;
    application_id?: string;
    order_reference?: string;
    [key: string]: unknown;
  };
};

export type CreateCheckoutSuccessResponse = {
  success: true;
  order_reference: string;
  order_id: string;
  status: "pending" | "paid" | "failed" | "cancelled";
};
