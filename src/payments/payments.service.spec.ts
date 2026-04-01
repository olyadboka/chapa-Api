import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IdempotencyKey } from '../database/entities/idempotency-key.entity';
import { PaymentStatus } from '../database/entities/payment-status.enum';
import { Payment } from '../database/entities/payment.entity';
import { ChapaService } from '../chapa/chapa.service';
import { RedisService } from '../redis/redis.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentRepo: Record<string, jest.Mock>;
  let idempotencyRepo: Record<string, jest.Mock>;
  let chapaService: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;

  beforeEach(async () => {
    paymentRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ id: 'uuid-1', ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    idempotencyRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      remove: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    chapaService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      extractVerifyStatus: jest.fn(),
      isInitializeSuccess: jest.fn(),
      getCheckoutUrl: jest.fn(),
    };

    redisService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        { provide: getRepositoryToken(IdempotencyKey), useValue: idempotencyRepo },
        { provide: ChapaService, useValue: chapaService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  const dto = {
    amount: '100',
    currency: 'ETB',
    email: 'test@test.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  describe('initialize', () => {
    it('should return cached response for existing idempotency key', async () => {
      const cached = {
        key: 'idem-1',
        requestHash: expect.any(String),
        responseBody: { success: true, txRef: 'tx_1' },
        expiresAt: new Date(Date.now() + 86400000),
      };
      // We need the hash to match, so we compute it by calling initialize
      // and capturing what hash it looks for. Instead, let's just mock findOne
      // to always return cached with a matching hash.
      idempotencyRepo.findOne.mockResolvedValue({
        ...cached,
        requestHash: require('../utils/crypto').hashSha256Json(dto),
      });

      const result = await service.initialize(dto as any, 'idem-1');

      expect(result.idempotentReplay).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should throw ConflictException when idempotency key reused with different body', async () => {
      idempotencyRepo.findOne.mockResolvedValue({
        key: 'idem-1',
        requestHash: 'different-hash',
        responseBody: {},
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(service.initialize(dto as any, 'idem-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should skip expired idempotency keys', async () => {
      idempotencyRepo.findOne
        .mockResolvedValueOnce({
          key: 'idem-1',
          requestHash: 'old-hash',
          responseBody: {},
          expiresAt: new Date(Date.now() - 1000), // expired
        })
        .mockResolvedValueOnce(null); // double-check after lock

      paymentRepo.findOne.mockResolvedValue(null);
      chapaService.initializeTransaction.mockResolvedValue({ status: 'success', data: { checkout_url: 'https://checkout.url' } });
      chapaService.isInitializeSuccess.mockReturnValue(true);
      chapaService.getCheckoutUrl.mockReturnValue('https://checkout.url');

      const result = await service.initialize(dto as any, 'idem-1');

      expect(idempotencyRepo.remove).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should create payment and call Chapa on new request', async () => {
      idempotencyRepo.findOne.mockResolvedValue(null);
      paymentRepo.findOne.mockResolvedValue(null);
      chapaService.initializeTransaction.mockResolvedValue({
        status: 'success',
        data: { checkout_url: 'https://checkout.chapa.co/abc' },
      });
      chapaService.isInitializeSuccess.mockReturnValue(true);
      chapaService.getCheckoutUrl.mockReturnValue('https://checkout.chapa.co/abc');

      const result = await service.initialize(dto as any, 'idem-new');

      expect(result.success).toBe(true);
      expect(result.checkoutUrl).toBe('https://checkout.chapa.co/abc');
      expect(paymentRepo.save).toHaveBeenCalled();
      expect(idempotencyRepo.save).toHaveBeenCalled();
      expect(redisService.releaseLock).toHaveBeenCalled();
    });

    it('should return failure when Chapa rejects initialization', async () => {
      idempotencyRepo.findOne.mockResolvedValue(null);
      paymentRepo.findOne.mockResolvedValue(null);
      chapaService.initializeTransaction.mockResolvedValue({ status: 'failed' });
      chapaService.isInitializeSuccess.mockReturnValue(false);

      const result = await service.initialize(dto as any, 'idem-fail');

      expect(result.success).toBe(false);
    });

    it('should handle Chapa network error', async () => {
      idempotencyRepo.findOne.mockResolvedValue(null);
      paymentRepo.findOne.mockResolvedValue(null);
      chapaService.initializeTransaction.mockRejectedValue(new Error('Network error'));

      const result = await service.initialize(dto as any, 'idem-err');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Chapa initialize request failed');
    });

    it('should throw ConflictException when lock cannot be acquired', async () => {
      idempotencyRepo.findOne.mockResolvedValue(null);
      redisService.acquireLock.mockResolvedValue(false);

      await expect(service.initialize(dto as any, 'idem-locked')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findByTxRef', () => {
    it('should return payment when found', async () => {
      paymentRepo.findOne.mockResolvedValue({
        id: 'uuid-1',
        txRef: 'tx_1',
        amount: '100',
        currency: 'ETB',
        status: PaymentStatus.SUCCESS,
        email: 'test@test.com',
        checkoutUrl: null,
        chapaReference: 'ref-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findByTxRef('tx_1');
      expect(result.txRef).toBe('tx_1');
    });

    it('should throw NotFoundException when not found', async () => {
      paymentRepo.findOne.mockResolvedValue(null);

      await expect(service.findByTxRef('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyWithChapa', () => {
    it('should update payment status to SUCCESS on successful verify', async () => {
      const payment = {
        id: 'uuid-1',
        txRef: 'tx_1',
        status: PaymentStatus.INITIALIZED,
        amount: '100',
        currency: 'ETB',
        email: 'test@test.com',
        checkoutUrl: null,
        chapaReference: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      paymentRepo.findOne.mockResolvedValue(payment);
      chapaService.verifyTransaction.mockResolvedValue({ data: { status: 'success' } });
      chapaService.extractVerifyStatus.mockReturnValue({ status: 'success', reference: 'chapa-ref' });

      const result = await service.verifyWithChapa('tx_1');

      expect(result.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(paymentRepo.save).toHaveBeenCalled();
    });

    it('should update payment status to FAILED', async () => {
      const payment = {
        id: 'uuid-1',
        txRef: 'tx_1',
        status: PaymentStatus.INITIALIZED,
        amount: '100',
        currency: 'ETB',
        email: 'test@test.com',
        checkoutUrl: null,
        chapaReference: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      paymentRepo.findOne.mockResolvedValue(payment);
      chapaService.verifyTransaction.mockResolvedValue({ data: { status: 'failed' } });
      chapaService.extractVerifyStatus.mockReturnValue({ status: 'failed' });

      const result = await service.verifyWithChapa('tx_1');

      expect(result.payment.status).toBe(PaymentStatus.FAILED);
    });
  });

  describe('deleteExpiredKeys', () => {
    it('should delete expired idempotency keys', async () => {
      idempotencyRepo.delete.mockResolvedValue({ affected: 5 });

      const count = await service.deleteExpiredKeys();
      expect(count).toBe(5);
    });
  });

  describe('listPendingForReconciliation', () => {
    it('should return pending and initialized payments', async () => {
      const payments = [{ txRef: 'tx_1' }, { txRef: 'tx_2' }];
      paymentRepo.find.mockResolvedValue(payments);

      const result = await service.listPendingForReconciliation(50);

      expect(result).toEqual(payments);
      expect(paymentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should cap limit at 500', async () => {
      paymentRepo.find.mockResolvedValue([]);

      await service.listPendingForReconciliation(1000);

      expect(paymentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
    });
  });
});
