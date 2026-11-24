import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG } from './config/app-config.provider.js';
import type { AppConfig } from './config/app-config.js';
import { configureApp } from './config/configure-app.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
const config = app.get<AppConfig>(APP_CONFIG);
configureApp(app, config);
await app.listen(config.port);
