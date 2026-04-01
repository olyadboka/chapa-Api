import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { Payment } from '../database/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledReconciliation() {
    this.logger.log('Scheduled reconciliation started');
    const result = await this.reconcilePending(50);
    this.logger.log(
      `Scheduled reconciliation done: ${result.scanned} scanned`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledIdempotencyCleanup() {
    this.logger.log('Expired idempotency key cleanup started');
    const deleted = await this.payments.deleteExpiredKeys();
    this.logger.log(`Expired idempotency key cleanup done: ${deleted} removed`);
  }

  async summary() {
    const raw = await this.paymentRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: string }>();

    const byStatus = Object.fromEntries(
      raw.map((r) => [r.status, parseInt(r.count, 10)]),
    );
    return { byStatus, generatedAt: new Date().toISOString() };
  }

  async reconcilePending(batchSize: number) {
    const pending = await this.payments.listPendingForReconciliation(batchSize);
    const results: Array<{
      txRef: string;
      ok: boolean;
      status?: PaymentStatus;
      error?: string;
    }> = [];

    for (const p of pending) {
      try {
        const r = await this.payments.verifyWithChapa(p.txRef);
        results.push({
          txRef: p.txRef,
          ok: true,
          status: r.payment.status,
        });
      } catch (e: unknown) {
        results.push({
          txRef: p.txRef,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      scanned: pending.length,
      results,
    };
  }
}
