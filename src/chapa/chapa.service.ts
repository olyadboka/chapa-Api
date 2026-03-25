import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface ChapaInitializePayload {
  amount: string;
  currency: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  tx_ref: string;
  callback_url?: string;
  return_url?: string;
  meta?: Record<string, unknown>;
  customization?: Record<string, unknown>;
}

@Injectable()
export class ChapaService {
  private readonly logger = new Logger(ChapaService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('CHAPA_BASE_URL', 'https://api.chapa.co');
    this.secretKey = this.config.get<string>('CHAPA_SECRET_KEY', '');
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(payload: ChapaInitializePayload) {
    const url = `${this.baseUrl}/v1/transaction/initialize`;
    const { data } = await firstValueFrom(
      this.http.post(url, payload, { headers: this.authHeaders() }),
    );
    return data as Record<string, unknown>;
  }

  async verifyTransaction(txRef: string) {
    const url = `${this.baseUrl}/v1/transaction/verify/${encodeURIComponent(txRef)}`;
    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.authHeaders() }),
    );
    return data as Record<string, unknown>;
  }

  /**
   * Normalize Chapa verify response into a stable shape for persistence.
   */
  extractVerifyStatus(response: Record<string, unknown>): {
    status: string | undefined;
    amount: string | undefined;
    currency: string | undefined;
    txRef: string | undefined;
    reference: string | undefined;
  } {
    const data = (response?.data as Record<string, unknown>) ?? response;
    const txRef =
      (data?.tx_ref as string) ??
      (data?.trx_ref as string) ??
      (response?.tx_ref as string);
    return {
      status: (data?.status as string) ?? (response?.status as string),
      amount: data?.amount != null ? String(data.amount) : undefined,
      currency: data?.currency as string | undefined,
      txRef,
      reference: (data?.reference as string) ?? undefined,
    };
  }

  getCheckoutUrl(initializeResponse: Record<string, unknown>): string | undefined {
    const data = initializeResponse?.data as Record<string, unknown> | undefined;
    const url = data?.checkout_url ?? initializeResponse?.checkout_url;
    return typeof url === 'string' ? url : undefined;
  }

  isInitializeSuccess(initializeResponse: Record<string, unknown>): boolean {
    const status = initializeResponse?.status;
    const message = initializeResponse?.message;
    if (status === 'success') return true;
    if (message === 'success') return true;
    return false;
  }
}
