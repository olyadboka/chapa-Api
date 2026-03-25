export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  chapa: {
    baseUrl: process.env.CHAPA_BASE_URL ?? 'https://api.chapa.co',
    secretKey: process.env.CHAPA_SECRET_KEY,
    webhookSecret: process.env.CHAPA_WEBHOOK_SECRET,
  },
  apiKey: process.env.API_KEY ?? '',
});
