import 'reflect-metadata';
import { type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ENV, type Env } from './config/env.js';
import { openApiComponents } from './openapi/zod-openapi.js';

export const API_PREFIX = 'v1';

/** Applies the cross-cutting HTTP setup. Shared by main.ts and the integration tests. */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  // Caddy (same host or Docker network) forwards the client address; trust only private hops, so the
  // per-address limits (crash reports) see the phone, not the proxy.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: string) => void }).set(
    'trust proxy',
    'loopback, linklocal, uniquelocal',
  );
  app.enableShutdownHooks();
  if (env.CORS_ORIGINS.length > 0) app.enableCors({ origin: env.CORS_ORIGINS });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder().setTitle('Fi thnitek API').setVersion(env.APP_VERSION).build();
    const document = SwaggerModule.createDocument(app, config);
    document.components = {
      ...document.components,
      schemas: { ...document.components?.schemas, ...openApiComponents() },
    };
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }
}

export async function createApp(rootModule: Type<unknown>): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  configureApp(app);
  return app;
}
