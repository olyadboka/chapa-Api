import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  DATABASE_SSL: Joi.string().valid('true', 'false').optional(),
  REDIS_URL: Joi.string().allow('').optional(),
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.string().optional(),
  REDIS_USERNAME: Joi.string().optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TLS: Joi.string().valid('true', 'false', '0', '1').optional(),
  REDIS_DISABLED: Joi.string().valid('true', 'false').optional(),
  CHAPA_BASE_URL: Joi.string().uri().default('https://api.chapa.co'),
  CHAPA_SECRET_KEY: Joi.string().required(),
  CHAPA_WEBHOOK_SECRET: Joi.string().required(),
  API_KEY: Joi.string().allow('').default(''),
  CORS_ORIGIN: Joi.string().allow('').default('*'),
});
