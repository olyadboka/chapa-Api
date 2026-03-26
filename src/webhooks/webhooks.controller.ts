import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('chapa')
  @HttpCode(200)
  handle(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw || !Buffer.isBuffer(raw)) {
      throw new BadRequestException(
        'Raw body required for webhook verification',
      );
    }
    return this.webhooks.handleChapa(raw, req.headers);
  }
}
