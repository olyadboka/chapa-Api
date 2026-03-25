import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
@UseGuards(ApiKeyGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('summary')
  summary() {
    return this.reconciliation.summary();
  }

  @Post('run')
  run(@Query('limit') limit?: string) {
    const n = Math.min(parseInt(limit ?? '50', 10) || 50, 500);
    return this.reconciliation.reconcilePending(n);
  }
}
