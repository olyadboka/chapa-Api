import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { ChapaModule } from './chapa/chapa.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
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
    DatabaseModule,
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
