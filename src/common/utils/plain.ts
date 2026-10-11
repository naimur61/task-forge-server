/** `T` as a plain object type, without class identity. */
export type Plain<T> = { [K in keyof T]: T[K] };

/** Returns a shallow, prototype-free copy of a DTO (`{ ...dto }` on a class instance is lint-flagged). */
export function plain<T extends object>(dto: T): Plain<T> {
  return Object.assign({}, dto);
}
