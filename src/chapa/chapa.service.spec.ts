import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { ChapaService } from './chapa.service';

describe('ChapaService', () => {
  let service: ChapaService;
  let http: { post: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    http = { post: jest.fn(), get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChapaService,
        { provide: HttpService, useValue: http },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              const map: Record<string, string> = {
                CHAPA_BASE_URL: 'https://api.chapa.co',
                CHAPA_SECRET_KEY: 'test-secret',
              };
              return map[key] ?? fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get(ChapaService);
  });

  describe('initializeTransaction', () => {
    it('should call Chapa initialize endpoint and return data', async () => {
      const chapaResponse = { status: 'success', data: { checkout_url: 'https://checkout.chapa.co/123' } };
      http.post.mockReturnValue(of({ data: chapaResponse }));

      const payload = {
        amount: '100',
        currency: 'ETB',
        email: 'test@test.com',
        first_name: 'John',
        last_name: 'Doe',
        tx_ref: 'tx_123',
      };

      const result = await service.initializeTransaction(payload);

      expect(result).toEqual(chapaResponse);
      expect(http.post).toHaveBeenCalledWith(
        'https://api.chapa.co/v1/transaction/initialize',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-secret',
          }),
        }),
      );
    });
  });

  describe('verifyTransaction', () => {
    it('should call Chapa verify endpoint and return data', async () => {
      const verifyResponse = { status: 'success', data: { status: 'success', tx_ref: 'tx_123' } };
      http.get.mockReturnValue(of({ data: verifyResponse }));

      const result = await service.verifyTransaction('tx_123');

      expect(result).toEqual(verifyResponse);
      expect(http.get).toHaveBeenCalledWith(
        'https://api.chapa.co/v1/transaction/verify/tx_123',
        expect.any(Object),
      );
    });

    it('should encode special characters in txRef', async () => {
      http.get.mockReturnValue(of({ data: {} }));

      await service.verifyTransaction('tx ref/special');

      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('tx%20ref%2Fspecial'),
        expect.any(Object),
      );
    });
  });

  describe('extractVerifyStatus', () => {
    it('should extract status from nested data', () => {
      const result = service.extractVerifyStatus({
        data: { status: 'success', amount: '100', currency: 'ETB', tx_ref: 'tx_1', reference: 'ref_1' },
      });

      expect(result).toEqual({
        status: 'success',
        amount: '100',
        currency: 'ETB',
        txRef: 'tx_1',
        reference: 'ref_1',
      });
    });

    it('should fall back to top-level fields', () => {
      const result = service.extractVerifyStatus({
        status: 'failed',
        tx_ref: 'tx_2',
      });

      expect(result.status).toBe('failed');
      expect(result.txRef).toBe('tx_2');
    });

    it('should handle missing data gracefully', () => {
      const result = service.extractVerifyStatus({});

      expect(result.status).toBeUndefined();
      expect(result.txRef).toBeUndefined();
      expect(result.reference).toBeUndefined();
    });
  });

  describe('getCheckoutUrl', () => {
    it('should extract checkout_url from nested data', () => {
      const url = service.getCheckoutUrl({
        data: { checkout_url: 'https://checkout.chapa.co/123' },
      });
      expect(url).toBe('https://checkout.chapa.co/123');
    });

    it('should extract checkout_url from top level', () => {
      const url = service.getCheckoutUrl({
        checkout_url: 'https://checkout.chapa.co/456',
      });
      expect(url).toBe('https://checkout.chapa.co/456');
    });

    it('should return undefined when no url exists', () => {
      expect(service.getCheckoutUrl({})).toBeUndefined();
    });
  });

  describe('isInitializeSuccess', () => {
    it('should return true for status success', () => {
      expect(service.isInitializeSuccess({ status: 'success' })).toBe(true);
    });

    it('should return true for message success', () => {
      expect(service.isInitializeSuccess({ message: 'success' })).toBe(true);
    });

    it('should return false for failed status', () => {
      expect(service.isInitializeSuccess({ status: 'failed' })).toBe(false);
    });

    it('should return false for empty response', () => {
      expect(service.isInitializeSuccess({})).toBe(false);
    });
  });
});
