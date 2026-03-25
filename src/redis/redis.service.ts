import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private disabled = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.disabled = this.config.get<boolean>('redisDisabled') ?? false;
    if (this.disabled) {
      this.logger.warn(
        'Redis is disabled (no REDIS_URL in production, or REDIS_DISABLED=true). Idempotency locks fall back to PostgreSQL only.',
      );
      return;
    }

    const url = this.config.get<string>('redisUrl');
    if (!url?.trim()) {
      this.disabled = true;
      this.logger.warn('Redis URL empty; Redis disabled.');
      return;
    }

    const tls = url.startsWith('rediss://') ? {} : undefined;
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10_000,
      tls,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('error', (err) =>
      this.logger.error(`Redis connection error: ${err.message}`),
    );

    try {
      await this.client.connect();
      this.logger.log('Redis connected');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Redis connect failed; locks will be skipped: ${msg}`);
      try {
        this.client.disconnect();
      } catch {
        /* ignore */
      }
      this.client = null;
      this.disabled = true;
    }
  }

  onModuleDestroy() {
    return this.client?.quit();
  }

  get redis(): Redis | null {
    return this.client;
  }

  /** Short-lived lock for concurrent idempotency key races (cross-instance). */
  async acquireLock(resource: string, ttlSeconds: number): Promise<boolean> {
    if (this.disabled || !this.client) {
      return true;
    }
    const key = `lock:${resource}`;
    try {
      const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Redis SET NX failed; continuing without lock: ${msg}`);
      return true;
    }
  }

  async releaseLock(resource: string): Promise<void> {
    if (this.disabled || !this.client) {
      return;
    }
    try {
      await this.client.del(`lock:${resource}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Redis DEL lock failed (non-fatal): ${msg}`);
    }
  }
}
