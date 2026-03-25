import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ChapaService } from './chapa.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
  ],
  providers: [ChapaService],
  exports: [ChapaService, HttpModule],
})
export class ChapaModule {}
