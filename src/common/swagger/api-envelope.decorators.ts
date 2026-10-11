import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger';

/** OpenAPI description of the `meta` block on list responses. */
export class PageMetaDoc {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) limit!: number;
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 5 }) totalPages!: number;
  @ApiProperty({ example: true }) hasNext!: boolean;
  @ApiProperty({ example: false }) hasPrev!: boolean;
}

/** Documents a `{ data: Model }` success response. */
export const ApiOkEnvelope = (model: Type<unknown>): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data'],
        properties: { data: { $ref: getSchemaPath(model) } },
      },
    }),
  );

/** Documents a `{ data: Model }` 201 response. */
export const ApiCreatedEnvelope = (model: Type<unknown>): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model),
    ApiCreatedResponse({
      schema: {
        type: 'object',
        required: ['data'],
        properties: { data: { $ref: getSchemaPath(model) } },
      },
    }),
  );

/** Documents a `{ data: Model[] }` success response without paging. */
export const ApiListEnvelope = (model: Type<unknown>): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
        },
      },
    }),
  );

/** Documents a `{ data: Model[], meta }` list response. */
export const ApiPaginatedEnvelope = (model: Type<unknown>): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model, PageMetaDoc),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMetaDoc) },
        },
      },
    }),
  );
