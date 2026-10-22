import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id as string;

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      });
    }

    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        fields[issue.path.join('.') || 'form'] ??= issue.message;
      }
      return reply.code(400).send({
        error: { code: 'validation_failed', message: 'Some fields need attention.', fields, requestId },
      });
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({
        error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.', requestId },
      });
    }

    request.log.error({ err: error, requestId }, 'unhandled error');
    return reply.code(500).send({
      error: { code: 'internal_error', message: 'Something went wrong on our side.', requestId },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: { code: 'not_found', message: 'No such endpoint.', requestId: request.id as string },
    });
  });
}
