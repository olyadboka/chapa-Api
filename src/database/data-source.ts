import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { WebhookEvent } from './entities/webhook-event.entity';

const databaseUrl = process.env.DATABASE_URL;
const ssl =
  process.env.DATABASE_SSL === 'true' ||
  (databaseUrl ?? '').includes('supabase.co');

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  ssl: ssl ? { rejectUnauthorized: false } : false,
  entities: [Payment, IdempotencyKey, WebhookEvent],
  migrations: ['src/database/migrations/*.ts'],
  logging: process.env.NODE_ENV === 'development',
});
