import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.config.get<string>('API_KEY', '');
    if (!key) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const headerKey = req.headers['x-api-key'];
    const auth = req.headers['authorization'];
    const bearer = auth?.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim()
      : undefined;
    const provided = headerKey ?? bearer;
    if (!provided || provided !== key) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
