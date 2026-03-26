import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import { Repository } from 'typeorm';
import { ChapaService } from '../chapa/chapa.service';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { Payment } from '../database/entities/payment.entity';
import { WebhookEvent } from '../database/entities/webhook-event.entity';
import { safeEqualHex } from '../utils/crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly chapa: ChapaService,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(WebhookEvent)
    private readonly webhookRepo: Repository<WebhookEvent>,
  ) {}

  async handleChapa(rawBody: Buffer, headers: IncomingHttpHeaders) {
    const secret = this.config.get<string>('CHAPA_WEBHOOK_SECRET', '');
    const sig =
      (headers['x-chapa-signature'] as string | undefined) ??
      (headers['chapa-signature'] as string | undefined);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }

    if (!this.verifyChapaSignature(rawBody, parsed, secret, sig)) {
      this.logger.warn('Invalid Chapa webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const parsedEvent = parsed.event;
    const event = typeof parsedEvent === 'string' ? parsedEvent : '';
    const txRef = (parsed.tx_ref as string) ?? null;
    const reference =
      (parsed.reference as string) ?? (parsed.chapa_reference as string) ?? '';

    const dedupKey = createHash('sha256')
      .update(`${event}|${txRef ?? ''}|${reference}`)
      .digest('hex');

    try {
      await this.webhookRepo.save(
        this.webhookRepo.create({
          dedupKey,
          eventType: event || 'unknown',
          txRef,
          chapaReference: reference || null,
          payload: parsed,
          verifiedWithChapa: false,
        }),
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') {
        return { received: true, duplicate: true };
      }
      throw e;
    }

    if (!txRef || !event.startsWith('charge.')) {
      return { received: true, processed: false, reason: 'ignored_event' };
    }

    const payment = await this.paymentRepo.findOne({ where: { txRef } });
    if (!payment) {
      this.logger.warn(`Webhook for unknown tx_ref ${txRef}`);
      return { received: true, processed: false, reason: 'unknown_tx_ref' };
    }

    const verify = await this.chapa.verifyTransaction(txRef);
    payment.lastVerifyResponse = verify;
    const extracted = this.chapa.extractVerifyStatus(verify);
    const st = (extracted.status ?? '').toLowerCase();

    if (st === 'success') {
      payment.status = PaymentStatus.SUCCESS;
      payment.chapaReference = extracted.reference ?? payment.chapaReference;
    } else if (st === 'failed') {
      payment.status = PaymentStatus.FAILED;
    } else if (st === 'cancelled' || st === 'canceled') {
      payment.status = PaymentStatus.CANCELLED;
    }

    await this.paymentRepo.save(payment);

    await this.webhookRepo.update({ dedupKey }, { verifiedWithChapa: true });

    return {
      received: true,
      processed: true,
      txRef,
      status: payment.status,
    };
  }

  private verifyChapaSignature(
    raw: Buffer,
    parsed: Record<string, unknown>,
    secret: string,
    signature: string | undefined,
  ): boolean {
    if (!signature || !secret) return false;
    const hRaw = createHmac('sha256', secret).update(raw).digest('hex');
    const hParsed = createHmac('sha256', secret)
      .update(JSON.stringify(parsed))
      .digest('hex');
    return safeEqualHex(hRaw, signature) || safeEqualHex(hParsed, signature);
  }
}
