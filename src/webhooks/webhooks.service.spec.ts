import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { Payment } from '../database/entities/payment.entity';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { WebhookEvent } from '../database/entities/webhook-event.entity';
import { ChapaService } from '../chapa/chapa.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let paymentRepo: Record<string, jest.Mock>;
  let webhookRepo: Record<string, jest.Mock>;
  let chapaService: Record<string, jest.Mock>;
  const webhookSecret = 'test-webhook-secret';

  beforeEach(async () => {
    paymentRepo = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    webhookRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue(undefined),
    };

    chapaService = {
      verifyTransaction: jest.fn(),
      extractVerifyStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              if (key === 'CHAPA_WEBHOOK_SECRET') return webhookSecret;
              return fallback;
            },
          },
        },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        { provide: getRepositoryToken(WebhookEvent), useValue: webhookRepo },
        { provide: ChapaService, useValue: chapaService },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  function signPayload(payload: Record<string, unknown>): {
    raw: Buffer;
    signature: string;
  } {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = createHmac('sha256', webhookSecret)
      .update(raw)
      .digest('hex');
    return { raw, signature };
  }

  describe('handleChapa', () => {
    it('should reject invalid JSON', async () => {
      const raw = Buffer.from('not-json', 'utf8');

      await expect(
        service.handleChapa(raw, { 'x-chapa-signature': 'any' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid signature', async () => {
      const payload = { event: 'charge.success', tx_ref: 'tx_1' };
      const raw = Buffer.from(JSON.stringify(payload), 'utf8');

      await expect(
        service.handleChapa(raw, { 'x-chapa-signature': 'invalid-sig' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject missing signature', async () => {
      const payload = { event: 'charge.success', tx_ref: 'tx_1' };
      const raw = Buffer.from(JSON.stringify(payload), 'utf8');

      await expect(service.handleChapa(raw, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle duplicate webhook (dedup)', async () => {
      const payload = { event: 'charge.success', tx_ref: 'tx_1', reference: 'ref_1' };
      const { raw, signature } = signPayload(payload);
      webhookRepo.save.mockRejectedValue({ code: '23505' });

      const result = await service.handleChapa(raw, {
        'x-chapa-signature': signature,
      });

      expect(result).toEqual({ received: true, duplicate: true });
    });

    it('should ignore non-charge events', async () => {
      const payload = { event: 'transfer.success', tx_ref: 'tx_1', reference: 'ref_1' };
      const { raw, signature } = signPayload(payload);

      const result = await service.handleChapa(raw, {
        'x-chapa-signature': signature,
      });

      expect(result).toEqual({
        received: true,
        processed: false,
        reason: 'ignored_event',
      });
    });

    it('should return unknown_tx_ref when payment not found', async () => {
      const payload = { event: 'charge.success', tx_ref: 'tx_unknown', reference: 'ref_1' };
      const { raw, signature } = signPayload(payload);
      paymentRepo.findOne.mockResolvedValue(null);

      const result = await service.handleChapa(raw, {
        'x-chapa-signature': signature,
      });

      expect(result).toEqual({
        received: true,
        processed: false,
        reason: 'unknown_tx_ref',
      });
    });

    it('should update payment to SUCCESS on valid charge.success webhook', async () => {
      const payload = { event: 'charge.success', tx_ref: 'tx_1', reference: 'ref_1' };
      const { raw, signature } = signPayload(payload);

      const payment = {
        txRef: 'tx_1',
        status: PaymentStatus.INITIALIZED,
        chapaReference: null,
      };
      paymentRepo.findOne.mockResolvedValue(payment);
      chapaService.verifyTransaction.mockResolvedValue({
        data: { status: 'success', reference: 'chapa-ref' },
      });
      chapaService.extractVerifyStatus.mockReturnValue({
        status: 'success',
        reference: 'chapa-ref',
      });

      const result = await service.handleChapa(raw, {
        'x-chapa-signature': signature,
      });

      expect(result.processed).toBe(true);
      expect(result.status).toBe(PaymentStatus.SUCCESS);
      expect(payment.status).toBe(PaymentStatus.SUCCESS);
      expect(payment.chapaReference).toBe('chapa-ref');
      expect(webhookRepo.update).toHaveBeenCalled();
    });

    it('should accept chapa-signature header (lowercase)', async () => {
      const payload = { event: 'charge.failed', tx_ref: 'tx_2', reference: 'ref_2' };
      const { raw, signature } = signPayload(payload);

      const payment = { txRef: 'tx_2', status: PaymentStatus.INITIALIZED };
      paymentRepo.findOne.mockResolvedValue(payment);
      chapaService.verifyTransaction.mockResolvedValue({ data: { status: 'failed' } });
      chapaService.extractVerifyStatus.mockReturnValue({ status: 'failed' });

      const result = await service.handleChapa(raw, {
        'chapa-signature': signature,
      });

      expect(result.processed).toBe(true);
      expect(result.status).toBe(PaymentStatus.FAILED);
    });
  });
});
