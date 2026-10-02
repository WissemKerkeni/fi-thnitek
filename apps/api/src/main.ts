import { AppModule } from './app.module.js';
import { createApp } from './app.factory.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await createApp(AppModule);
  await app.listen(app.get<Env>(ENV).PORT);
}

void bootstrap();
