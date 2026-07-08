# payment-backend

Backend-only Next.js service for PromptZeno payments.

Target domain: `pay.promptzeno.com`

This project is only the foundation for an independent payment backend. It does not include Stripe, Supabase, webhooks, or checkout logic yet.

## Routes

- `GET /` - service running message
- `GET /api/health` - health check
- `GET /api/pay/test` - payment API route test

## Local Setup

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

Current variables:

```text
SERVICE_URL=http://localhost:3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Validate

```bash
npm run lint
npm run typecheck
npm run build
```

## Deploy to Vercel

1. Create a new Vercel project using this `payment-backend` folder as the project root.
2. Keep the framework preset as Next.js.
3. Add the production domain `pay.promptzeno.com` in Vercel project settings.
4. Configure DNS for `pay.promptzeno.com` as Vercel instructs.
5. Deploy.

## Test Health Endpoint

Local:

```bash
curl http://localhost:3000/api/health
```

Production:

```bash
curl https://pay.promptzeno.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "payment-backend"
}
```
