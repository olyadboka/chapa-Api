function buildRedisUrlFromParts(): string | null {
  const host = (process.env.REDIS_HOST ?? '').trim();
  const port = (process.env.REDIS_PORT ?? '').trim();
  if (!host || !port) return null;
  const username = (process.env.REDIS_USERNAME ?? 'default').trim();
  const password = process.env.REDIS_PASSWORD ?? '';
  const useTls =
    process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';
  const scheme = useTls ? 'rediss' : 'redis';
  return `${scheme}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

export default () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const redisUrlDirect = (process.env.REDIS_URL ?? '').trim();
  const redisUrlFromParts = buildRedisUrlFromParts();
  const resolvedRedisUrl = redisUrlDirect || redisUrlFromParts;
  const redisExplicitlyDisabled = process.env.REDIS_DISABLED === 'true';
  /** Render Web Services has no Redis unless you use an add-on or external host (e.g. Upstash). */
  const redisDisabled =
    redisExplicitlyDisabled || (nodeEnv === 'production' && !resolvedRedisUrl);
  const redisUrl =
    resolvedRedisUrl ||
    (nodeEnv === 'production' ? '' : 'redis://localhost:6379');

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL,
    /** Enable TLS for Postgres (required for Supabase). Set true or use a supabase.co host in DATABASE_URL. */
    databaseSsl:
      process.env.DATABASE_SSL === 'true' ||
      (process.env.DATABASE_URL ?? '').includes('supabase.co'),
    redisDisabled,
    redisUrl,
    chapa: {
      baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co',
      secretKey: process.env.CHAPA_SECRET_KEY,
      webhookSecret: process.env.CHAPA_WEBHOOK_SECRET,
    },
    apiKey: process.env.API_KEY ?? '',
  };
};
