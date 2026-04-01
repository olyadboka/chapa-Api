import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'webhook_events' })
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  dedupKey!: string;

  @Column({ type: 'varchar', length: 120 })
  eventType!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  txRef!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chapaReference!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  verifiedWithChapa!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt!: Date;
}
