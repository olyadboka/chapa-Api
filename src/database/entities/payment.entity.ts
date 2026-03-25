import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from './payment-status.enum';

@Entity({ name: 'payments' })
@Index(['txRef'], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  txRef: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', length: 32, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chapaReference: string | null;

  @Column({ type: 'text', nullable: true })
  callbackUrl: string | null;

  @Column({ type: 'text', nullable: true })
  returnUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  chapaInitializeResponse: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  lastVerifyResponse: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
