import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

const IDEMPOTENCY_TTL_HOURS = 24;

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKey {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  key!: string;

  @Column({ type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'int' })
  httpStatus!: number;

  @Column({ type: 'jsonb' })
  responseBody!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Index()
  @Column({
    type: 'timestamptz',
    default: () =>
      `NOW() + INTERVAL '${IDEMPOTENCY_TTL_HOURS} hours'`,
  })
  expiresAt!: Date;
}
