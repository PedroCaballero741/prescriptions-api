import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

type ErrorPayload = {
  message: string;
  code: string;
  details?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status: HttpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorPayload = this.buildErrorPayload(exception, status);

    response.status(status).json(errorPayload);
  }

  private buildErrorPayload(
    exception: unknown,
    status: HttpStatus,
  ): ErrorPayload {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        return {
          message: exceptionResponse,
          code: this.getCodeByStatus(status),
        };
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseBody = exceptionResponse as {
          message?: string | string[];
          details?: unknown;
          code?: string;
        };

        const messages =
          typeof responseBody.message === 'string'
            ? [responseBody.message]
            : responseBody.message;

        return {
          message: messages?.[0] ?? exception.message,
          code: responseBody.code ?? this.getCodeByStatus(status),
          details:
            responseBody.details ??
            (messages && messages.length > 1 ? messages : undefined),
        };
      }

      return {
        message: exception.message,
        code: this.getCodeByStatus(status),
      };
    }

    if (exception instanceof Error) {
      return {
        message: exception.message,
        code: this.getCodeByStatus(status),
      };
    }

    return {
      message: 'Internal server error',
      code: this.getCodeByStatus(status),
    };
  }

  private getCodeByStatus(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
