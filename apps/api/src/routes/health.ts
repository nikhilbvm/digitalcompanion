import { Router } from 'express';
import { configuredServices } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.1.0',
    uptime: process.uptime(),
    configured: configuredServices(),
  });
});
