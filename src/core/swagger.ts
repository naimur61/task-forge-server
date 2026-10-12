import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI document + UI at `/api/docs` (JSON at `/api/docs-json`). */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TaskForge API')
      .setDescription('Project & task management backend, see BACKEND_API.md')
      .setVersion('1')
      .addBearerAuth()
      .build(),
  );
  // Serverless bundles do not include swagger-ui's static files, so load them from a CDN there.
  const cdn = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
  SwaggerModule.setup('api/docs', app, document, {
    ...(process.env['VERCEL'] && {
      customCssUrl: `${cdn}/swagger-ui.css`,
      customJs: [
        `${cdn}/swagger-ui-bundle.js`,
        `${cdn}/swagger-ui-standalone-preset.js`,
      ],
    }),
  });
}
