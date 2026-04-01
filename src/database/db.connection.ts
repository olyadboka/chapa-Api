import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const createDatabaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const nodeEnv = config.get<string>('nodeEnv');
  const databaseUrl = config.get<string>('databaseUrl');
  const ssl = config.get<boolean>('databaseSsl') ?? false;

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
    synchronize: nodeEnv !== 'production',
    logging: nodeEnv === 'development',
  };
};
