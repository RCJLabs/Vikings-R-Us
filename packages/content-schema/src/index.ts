import { z } from 'zod';
import { PACK_IDS } from './targets';

export * from './content';
export * from './targets';

export const PackIdSchema = z.enum(PACK_IDS);

export const PackManifestSchema = z.strictObject({
  id: PackIdSchema,
  description: z.string().optional(),
  dependsOn: z.array(PackIdSchema).default([]),
  /**
   * A unique marker compiled into every build that includes this pack. The
   * leak check fails a demo build that contains it, and fails a full build
   * that doesn't.
   */
  canary: z.string().min(16).optional(),
  /** Version of the case generator's output. Bump it when a change alters generated cases (and so the Dailies). */
  genVersion: z.number().int().positive().optional(),
});
export type PackManifest = z.infer<typeof PackManifestSchema>;

/** String keys are dotted ids such as `core.title` or `case.thorvald.d3.l1`. */
export const StringKeySchema = z.string().regex(/^[a-z][a-z0-9]*(\.[a-zA-Z0-9_-]+)+$/);
export const StringTableSchema = z.record(StringKeySchema, z.string());
export type StringTable = z.infer<typeof StringTableSchema>;
