import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns health payload', () => {
    const controller = new AppController();
    const result = controller.health();

    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
