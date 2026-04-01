<p align="left">
  <img width="225" height="425" alt="image" src="https://github.com/user-attachments/assets/153d4662-5eb3-4bf8-88a9-6fb06f0fb4c5" />

  <img width="225" height="225" alt="image" src="https://github.com/user-attachments/assets/c2cb3686-6776-4bbd-bc6c-079084055356" style="margin-right:40px;" />
  <img width="225" height="225" alt="image" src="https://github.com/user-attachments/assets/b6f96dcd-76e9-41e9-b25d-04a899e1594d" />
  
</p>

## Chapa payment gateway

REST API for payment processing with [Chapa](https://developer.chapa.co/), built with **NestJS**, **PostgreSQL** (Supabase-friendly), optional **Redis** for idempotency locks, idempotent payment creation, signed webhooks, and reconciliation helpers.

## Stack

- **Runtime:** Node.js, NestJS 11
- **Database:** PostgreSQL via TypeORM (e.g. Supabase)
- **Cache / locks:** Redis (optional; ioredis)
- **Payments:** Chapa REST API

## Prerequisites

- Node.js 18+
- A PostgreSQL database (Supabase or any Postgres URL)
- **Optional:** Redis locally (`docker compose up -d`) or a hosted Redis URL (Upstash, Redis Cloud, etc.)

## Project setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in values (see [Environment variables](#environment-variables)).

Start Redis for local development (optional):

```bash
docker compose up -d
```

Run the app:

```bash
# development (watch)
npm run start:dev

# production build
npm run build
npm run start:prod
```

Default HTTP port is **`3000`** unless `PORT` is set.

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection URI. For Supabase, use the **Direct** connection (port **5432**) from Project Settings → Database. TLS is enabled automatically when the host contains `supabase.co`, or set `DATABASE_SSL=true`. |
| `DATABASE_SSL` | Optional. `true` / `false` to force Postgres TLS. |
| `REDIS_URL` | Single URI for Redis (`redis://` or `rediss://` for TLS). If set, it takes precedence over `REDIS_HOST` / `REDIS_PORT`. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Alternative to `REDIS_URL` for Redis Cloud / Redis Labs. Set `REDIS_TLS=true` when the provider requires TLS. |
| `REDIS_DISABLED` | `true` disables Redis entirely (idempotency still uses PostgreSQL). In **production**, if neither `REDIS_URL` nor `REDIS_HOST`/`REDIS_PORT` are set, Redis stays off (typical for Render without Redis). |
| `CHAPA_SECRET_KEY` | Chapa secret key (`CHASECK_...`) for API calls. |
| `CHAPA_WEBHOOK_SECRET` | Webhook secret hash from the Chapa dashboard (HMAC verification). |
| `CHAPA_BASE_URL` | Defaults to `https://api.chapa.co`. |
| `API_KEY` | If set, required as `X-API-Key` or `Authorization: Bearer` on protected routes. Omit for local-only testing. |
| `NODE_ENV` | `development`, `production`, or `test`. |
| `PORT` | HTTP listen port (e.g. Render injects this). |

## HTTP routes

Routes under **`/api/v1`** except where noted.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness (no `/api/v1` prefix). |
| `POST` | `/api/v1/payments` | Initialize a payment. Requires header **`Idempotency-Key`**. |
| `GET` | `/api/v1/payments/:txRef` | Fetch payment by Chapa transaction reference. |
| `POST` | `/api/v1/payments/:txRef/verify` | Verify with Chapa and update status. |
| `GET` | `/api/v1/reconciliation/summary` | Counts by payment status. |
| `POST` | `/api/v1/reconciliation/run?limit=50` | Re-verify pending payments with Chapa. |
| `POST` | `/webhooks/chapa` | Chapa webhooks (no `/api/v1` prefix; raw body for signatures). |

Protected routes use **`ApiKeyGuard`** when `API_KEY` is configured.

## Chapa webhooks

In the Chapa dashboard, set your webhook URL to:

```
https://<your-host>/webhooks/chapa
```

Use the **same** secret string in the dashboard and in `CHAPA_WEBHOOK_SECRET`.


## Tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## License

MIT

Olyad Boka &copy; 2026
