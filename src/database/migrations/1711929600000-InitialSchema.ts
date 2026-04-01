import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1711929600000 implements MigrationInterface {
  name = 'InitialSchema1711929600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "txRef" varchar(255) NOT NULL,
        "idempotencyKey" varchar(255),
        "amount" decimal(14,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'ETB',
        "email" varchar(320) NOT NULL,
        "firstName" varchar(120) NOT NULL,
        "lastName" varchar(120) NOT NULL,
        "phoneNumber" varchar(20),
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "checkoutUrl" text,
        "chapaReference" varchar(255),
        "callbackUrl" text,
        "returnUrl" text,
        "meta" jsonb,
        "chapaInitializeResponse" jsonb,
        "lastVerifyResponse" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_txRef" UNIQUE ("txRef"),
        CONSTRAINT "UQ_payments_idempotencyKey" UNIQUE ("idempotencyKey")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_payments_txRef" ON "payments" ("txRef")
    `);

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "key" varchar(255) NOT NULL,
        "requestHash" varchar(64) NOT NULL,
        "httpStatus" int NOT NULL,
        "responseBody" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
        CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_idempotency_keys_expiresAt" ON "idempotency_keys" ("expiresAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dedupKey" varchar(64) NOT NULL,
        "eventType" varchar(120) NOT NULL,
        "txRef" varchar(255),
        "chapaReference" varchar(255),
        "payload" jsonb NOT NULL,
        "verifiedWithChapa" boolean NOT NULL DEFAULT false,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_webhook_events_dedupKey" UNIQUE ("dedupKey")
      )
    `);

    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP INDEX "IDX_idempotency_keys_expiresAt"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_txRef"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
