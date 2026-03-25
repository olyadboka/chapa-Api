import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { ChapaModule } from './chapa/chapa.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    ChapaModule,
    PaymentsModule,
    WebhooksModule,
    ReconciliationModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
