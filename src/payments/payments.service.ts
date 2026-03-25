import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ChapaService } from '../chapa/chapa.service';
import { IdempotencyKey } from '../database/entities/idempotency-key.entity';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { Payment } from '../database/entities/payment.entity';
import { RedisService } from '../redis/redis.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
    private readonly chapa: ChapaService,
    private readonly redis: RedisService,
  ) {}

  async initialize(
    dto: InitializePaymentDto,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const requestHash = hashRequestBody(dto);
    const cached = await this.idempotencyRepo.findOne({
      where: { key: idempotencyKey },
    });
    if (cached) {
      if (cached.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key was reused with a different request body',
        );
      }
      return {
        idempotentReplay: true,
        ...cached.responseBody,
      };
    }

    const lockOk = await this.redis.acquireLock(`idem:${idempotencyKey}`, 45);
    if (!lockOk) {
      await this.sleep(150);
      return this.initialize(dto, idempotencyKey);
    }

    try {
      const again = await this.idempotencyRepo.findOne({
        where: { key: idempotencyKey },
      });
      if (again) {
        if (again.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency-Key was reused with a different request body',
          );
        }
        return { idempotentReplay: true, ...again.responseBody };
      }

      const txRef =
        dto.txRef?.trim() ||
        `gw_${createHash('sha256').update(`${idempotencyKey}:${Date.now()}`).digest('hex').slice(0, 24)}`;

      const existingTx = await this.paymentRepo.findOne({ where: { txRef } });
      if (existingTx) {
        throw new ConflictException('txRef already exists');
      }

      const payload = {
        amount: dto.amount,
        currency: dto.currency ?? 'ETB',
        email: dto.email,
        first_name: dto.firstName,
        last_name: dto.lastName,
        phone_number: dto.phoneNumber,
        tx_ref: txRef,
        callback_url: dto.callbackUrl,
        return_url: dto.returnUrl,
        meta: dto.meta,
        customization: dto.customization,
      };

      const payment = this.paymentRepo.create({
        txRef,
        idempotencyKey,
        amount: dto.amount,
        currency: dto.currency ?? 'ETB',
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber ?? null,
        status: PaymentStatus.PENDING,
        callbackUrl: dto.callbackUrl ?? null,
        returnUrl: dto.returnUrl ?? null,
        meta: dto.meta ?? null,
      });
      await this.paymentRepo.save(payment);

      let chapaRes: Record<string, unknown>;
      try {
        chapaRes = await this.chapa.initializeTransaction(payload);
      } catch (err: unknown) {
        this.logger.error(
          `Chapa initialize failed for ${txRef}: ${err instanceof Error ? err.message : err}`,
        );
        payment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(payment);
        const body = {
          success: false,
          txRef,
          paymentId: payment.id,
          error: 'Chapa initialize request failed',
        };
        await this.saveIdempotency(idempotencyKey, requestHash, 502, body);
        return body;
      }

      payment.chapaInitializeResponse = chapaRes;
      const ok = this.chapa.isInitializeSuccess(chapaRes);
      if (!ok) {
        payment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(payment);
        const body = {
          success: false,
          txRef,
          paymentId: payment.id,
          chapa: chapaRes,
        };
        await this.saveIdempotency(idempotencyKey, requestHash, 200, body);
        return body;
      }

      payment.status = PaymentStatus.INITIALIZED;
      payment.checkoutUrl = this.chapa.getCheckoutUrl(chapaRes) ?? null;
      await this.paymentRepo.save(payment);

      const body = {
        success: true,
        txRef,
        paymentId: payment.id,
        checkoutUrl: payment.checkoutUrl,
        status: payment.status,
      };
      await this.saveIdempotency(idempotencyKey, requestHash, 201, body);
      return body;
    } finally {
      await this.redis.releaseLock(`idem:${idempotencyKey}`);
    }
  }

  private async saveIdempotency(
    key: string,
    requestHash: string,
    httpStatus: number,
    responseBody: Record<string, unknown>,
  ) {
    try {
      await this.idempotencyRepo.save(
        this.idempotencyRepo.create({
          key,
          requestHash,
          httpStatus,
          responseBody,
        }),
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') {
        this.logger.warn(`Idempotency row race for key ${key}; ignoring duplicate insert`);
        return;
      }
      throw e;
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async findByTxRef(txRef: string) {
    const p = await this.paymentRepo.findOne({ where: { txRef } });
    if (!p) throw new NotFoundException('Payment not found');
    return this.toPublic(p);
  }

  async verifyWithChapa(txRef: string) {
    const payment = await this.paymentRepo.findOne({ where: { txRef } });
    if (!payment) throw new NotFoundException('Payment not found');

    const verify = await this.chapa.verifyTransaction(txRef);
    payment.lastVerifyResponse = verify;
    const extracted = this.chapa.extractVerifyStatus(verify);
    const st = (extracted.status ?? '').toLowerCase();
    if (st === 'success') {
      payment.status = PaymentStatus.SUCCESS;
      payment.chapaReference = extracted.reference ?? payment.chapaReference;
    } else if (st === 'failed' || st === 'cancelled' || st === 'canceled') {
      payment.status =
        st === 'cancelled' || st === 'canceled'
          ? PaymentStatus.CANCELLED
          : PaymentStatus.FAILED;
    }
    await this.paymentRepo.save(payment);

    return {
      payment: this.toPublic(payment),
      chapa: verify,
    };
  }

  private toPublic(p: Payment) {
    return {
      id: p.id,
      txRef: p.txRef,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      email: p.email,
      checkoutUrl: p.checkoutUrl,
      chapaReference: p.chapaReference,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async listPendingForReconciliation(limit: number) {
    return this.paymentRepo.find({
      where: [
        { status: PaymentStatus.PENDING },
        { status: PaymentStatus.INITIALIZED },
      ],
      order: { createdAt: 'ASC' },
      take: Math.min(limit, 500),
    });
  }
}
