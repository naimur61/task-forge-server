import { monotonicFactory } from 'ulidx';

const ulid = monotonicFactory();

/** Returns a time-sortable id like `tsk_01J9ZK…` (prefix plus ULID). */
export function newId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}
