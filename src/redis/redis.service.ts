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
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis connection error: ${err.message}`),
    );
  }

  onModuleDestroy() {
    return this.client?.quit();
  }

  get redis(): Redis {
    return this.client;
  }

  /** Short-lived lock for concurrent idempotency key races (cross-instance). */
  async acquireLock(resource: string, ttlSeconds: number): Promise<boolean> {
    const key = `lock:${resource}`;
    const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async releaseLock(resource: string): Promise<void> {
    await this.client.del(`lock:${resource}`);
  }
}
