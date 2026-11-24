import { type AppConfig, loadConfig } from './app-config.js';

export const APP_CONFIG = Symbol('APP_CONFIG');
export const appConfigProvider = { provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() };
