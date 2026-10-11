import type { Prisma } from '../../generated/prisma/client.js';
import type { TaskFilterDto } from './dto/task-request.dto.js';

/** Translates the shared list/board filters into a Prisma where clause, always scoped to one project. */
export function buildTaskWhere(
  projectId: string,
  userId: string,
  filter: TaskFilterDto,
): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [];
  if (filter.search) {
    and.push({
      OR: [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ],
    });
  }
  if (filter.status?.length) and.push({ status: { in: filter.status } });
  if (filter.priority?.length) and.push({ priority: { in: filter.priority } });
  if (filter.assigneeId === 'unassigned') and.push({ assigneeId: null });
  else if (filter.assigneeId) {
    and.push({
      assigneeId: filter.assigneeId === 'me' ? userId : filter.assigneeId,
    });
  }
  if (filter.labelId?.length) {
    and.push({ labels: { some: { labelId: { in: filter.labelId } } } });
  }
  if (filter.overdue) {
    and.push({ dueDate: { lt: new Date() }, status: { not: 'DONE' } });
  }
  return { projectId, AND: and };
}
