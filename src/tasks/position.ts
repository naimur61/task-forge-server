/** Gap used between neighbours when a column is (re)numbered. */
export const POSITION_STEP = 1000;
const MIN_GAP = 1e-6;

/**
 * Position for a task dropped after `afterPos` (null = top of column).
 * `column` holds the other tasks' positions of the target column, ascending.
 * Returns the new position, or `null` when the gap is too small and the column must be renumbered.
 */
export function positionBetween(
  column: number[],
  afterPos: number | null,
): number | null {
  const before = afterPos ?? 0;
  const next = afterPos === null ? column[0] : column.find((p) => p > afterPos);
  const after = next ?? before + 2 * POSITION_STEP;
  if (after - before < MIN_GAP) return null;
  return (before + after) / 2;
}
