/** Task statuses in board column order. */
export const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

/** Task priorities from lowest to highest rank. */
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/** Human label of a status, used in activity messages ("moved X to In Review"). */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

/** Sort rank of a member role: owner first. */
export const ROLE_RANK: Readonly<Record<string, number>> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
};
