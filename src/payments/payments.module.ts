import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChapaModule } from '../chapa/chapa.module';
import { IdempotencyKey } from '../database/entities/idempotency-key.entity';
import { Payment } from '../database/entities/payment.entity';
import { RedisModule } from '../redis/redis.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, IdempotencyKey]),
    ChapaModule,
    RedisModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
