export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  /** Enable TLS for Postgres (required for Supabase). Set true or use a supabase.co host in DATABASE_URL. */
  databaseSsl:
    process.env.DATABASE_SSL === 'true' ||
    (process.env.DATABASE_URL ?? '').includes('supabase.co'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  chapa: {
    baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co',
    secretKey: process.env.CHAPA_SECRET_KEY,
    webhookSecret: process.env.CHAPA_WEBHOOK_SECRET,
  },
  apiKey: process.env.API_KEY ?? '',
});
