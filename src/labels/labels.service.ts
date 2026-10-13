import { ForbiddenException, Injectable } from '@nestjs/common';
import { ApiException } from '../common/exceptions/api.exception.js';
import { newId } from '../common/utils/ids.js';
import { isUniqueViolation } from '../common/utils/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessInfo } from '../projects/project-access.js';
import { can } from '../projects/project-permissions.js';
import type { CreateLabelDto } from './dto/label-request.dto.js';
import type { LabelResponse } from './dto/label-response.dto.js';

/** Reads and creates project labels. */
@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists a project's labels by name. */
  findAll(projectId: string): Promise<LabelResponse[]> {
    return this.prisma.label.findMany({
      where: { projectId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Creates a label (OWNER, ADMIN); names are unique per project, ignoring case. */
  async create(
    access: ProjectAccessInfo,
    actorId: string,
    dto: CreateLabelDto,
  ): Promise<LabelResponse> {
    if (!can.createLabel(access.role)) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    const duplicate = await this.prisma.label.findFirst({
      where: {
        projectId: access.projectId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });
    if (duplicate) throw this.exists();
    try {
      const label = await this.prisma.label.create({
        data: {
          id: newId('lbl'),
          projectId: access.projectId,
          name: dto.name,
          color: dto.color ?? '#6366f1',
        },
      });
      return label;
    } catch (err) {
      // A concurrent request can still win the race; the unique index is the final guard.
      if (isUniqueViolation(err)) throw this.exists();
      throw err;
    }
  }

  /** The 409 returned for a duplicate label name. */
  private exists(): ApiException {
    return new ApiException(
      409,
      'LABEL_EXISTS',
      'A label with this name already exists.',
      { name: 'Already in use.' },
    );
  }
}
