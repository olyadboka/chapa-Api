import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { Payment } from '../database/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly payments: PaymentsService,
  ) {}

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
