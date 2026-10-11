import type { MemberRole } from '../../generated/prisma/enums.js';

/** Pure permission rules (BACKEND_API.md section 5). */
const isManager = (role: MemberRole) => role === 'OWNER' || role === 'ADMIN';

export const can = {
  updateProject: (role: MemberRole) => isManager(role),
  archiveProject: (role: MemberRole) => role === 'OWNER',
  deleteProject: (role: MemberRole) => role === 'OWNER',
  transferOwnership: (role: MemberRole) => role === 'OWNER',
  changeRole: (role: MemberRole) => role === 'OWNER',
  createLabel: (role: MemberRole) => isManager(role),
  /** ADMIN may only add MEMBERs; OWNER may add ADMIN or MEMBER. */
  addMember: (role: MemberRole, newRole: MemberRole) =>
    role === 'OWNER' || (role === 'ADMIN' && newRole === 'MEMBER'),
  /** OWNER may remove anyone but themselves; ADMIN only MEMBERs. */
  removeMember: (role: MemberRole, targetRole: MemberRole) =>
    role === 'OWNER' || (role === 'ADMIN' && targetRole === 'MEMBER'),
  editTask: (
    role: MemberRole,
    userId: string,
    task: { creatorId: string; assigneeId: string | null },
  ) =>
    isManager(role) || task.creatorId === userId || task.assigneeId === userId,
  deleteTask: (role: MemberRole, userId: string, task: { creatorId: string }) =>
    isManager(role) || task.creatorId === userId,
  deleteComment: (
    role: MemberRole,
    userId: string,
    comment: { authorId: string },
  ) => isManager(role) || comment.authorId === userId,
};
