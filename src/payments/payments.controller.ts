import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  async initialize(
    @Body() body: InitializePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const result = (await this.payments.initialize(
      body,
      idempotencyKey.trim(),
    )) as Record<string, unknown>;

    if (result.idempotentReplay) {
      const { idempotentReplay: _replay, ...rest } = result;
      res.status(200);
      return rest;
    }

    if (result.success === false) {
      if (result.error === 'Chapa initialize request failed') {
        res.status(502);
      } else {
        res.status(200);
      }
      return result;
    }

    res.status(201);
    return result;
  }

  @Get(':txRef')
  getOne(@Param('txRef') txRef: string) {
    return this.payments.findByTxRef(txRef);
  }

  @Post(':txRef/verify')
  @HttpCode(200)
  verify(@Param('txRef') txRef: string) {
    return this.payments.verifyWithChapa(txRef);
  }
}
