/** A project label. */
export class LabelResponse {
  id!: string;
  projectId!: string;
  name!: string;
  /** Hex colour, e.g. `#6366f1`. */
  color!: string;
}
