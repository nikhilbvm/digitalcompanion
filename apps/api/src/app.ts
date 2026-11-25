import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ZodError } from 'zod';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';
import { livekitRouter } from './routes/livekit.js';
import { peopleRouter } from './routes/people.js';

/**
 * App factory. `index.ts` owns listen(); this split keeps the app reusable
 * behind a Lambda handler or API Gateway adapter in Part 2.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use(peopleRouter);
  app.use(conversationsRouter);
  app.use(chatRouter);
  app.use(livekitRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }

    if (error instanceof ZodError) {
      res.status(400).json({ error: 'bad_request', issues: error.issues });
      return;
    }

    console.error('[api] unhandled error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
