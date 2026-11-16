// Content pack schemas, following DATA_MODEL.md ("Content pack"). Objects are strict, so an
// unknown field fails: the examinee pack can't carry a key by accident.
import { z } from 'zod';

const traitOrTextId = z.string().regex(/^(p4|ce):\d+$/);
const moduleId = z.enum(['p4', 'ce']);
const ciItemId = z.string().regex(/^ci:\d+$/);
const ceItemId = z.string().regex(/^ce:\d+$/);
const assets = z.record(z.string(), z.string());

export const traitSchema = z.strictObject({
  id: traitOrTextId,
  module: moduleId,
  name: z.string().min(1),
  reportCode: z.string().min(1),
  order: z.number(),
});

export const reportSectionSchema = z.strictObject({
  id: traitOrTextId,
  name: z.string().min(1),
  order: z.number(),
});

export const reportTextSchema = z.strictObject({
  id: traitOrTextId,
  module: moduleId,
  code: z.string().min(1),
  baseCode: z.string().min(1),
  variant: z.string().nullable(),
  html: z.string(),
  note: z.string().nullable(),
});

export const traitTextTableSchema = z.strictObject({
  traitId: traitOrTextId,
  profileIds: z.array(z.string()).nullable(),
  bands: z.array(z.strictObject({ min: z.number(), max: z.number(), textIds: z.array(traitOrTextId) })),
});

export const conclusionMapSchema = z.strictObject({
  defaultCode: z.string().min(1),
  exceptions: z.record(z.string(), z.string()),
});

export const ciItemSchema = z.strictObject({
  id: ciItemId,
  order: z.number(),
  imageAsset: z.string().min(1),
  answer: z.union([
    z.strictObject({ kind: z.literal('choice'), options: z.array(z.string().min(1)).min(2) }),
    z.strictObject({ kind: z.literal('number') }),
  ]),
});

export const ciKeySchema = z.strictObject({
  itemId: ciItemId,
  answer: z.string().min(1),
  factor: z.enum(['verbal', 'numeric', 'spatial']),
});

export const ciNormsSchema = z.strictObject({
  bands: z.array(z.strictObject({ id: z.string().min(1), minAge: z.number(), maxAge: z.number() })),
  table: z.record(z.string(), z.array(z.number())),
});

export const ceItemSchema = z.strictObject({
  id: ceItemId,
  order: z.number(),
  stem: z.string().min(1),
  options: z.array(z.strictObject({ key: z.enum(['A', 'B', 'C']), text: z.string().min(1) })),
});

export const ceScoringSchema = z.strictObject({
  itemId: ceItemId,
  traitId: traitOrTextId,
  points: z.strictObject({ A: z.number(), B: z.number(), C: z.number() }),
});

export const profileSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  locked: z.boolean(),
  hasRanges: z.boolean(),
  modules: z.array(moduleId),
  ranges: z.record(z.string(), z.strictObject({ min: z.number(), max: z.number() })),
});

export const normProfileSchema = z.strictObject({
  id: z.enum(['latam', 'europa-luscher']),
  name: z.string().min(1),
  label: z.string().min(1),
  colorReference: z.record(z.string(), z.number()),
  colorOrder: z.string(),
  interpretiveNotes: z.array(
    z.strictObject({ id: z.string().min(1), digit: z.string(), positions: z.array(z.number()), text: z.string().min(1), source: z.string().min(1) }),
  ),
  // No European CI or CE data exists, so both profiles use the existing tables.
  ciNorms: z.literal('latam'),
  ceNorms: z.literal('latam'),
  status: z.enum(['validated', 'reference-only']),
});

export const operatorPackSchema = z.strictObject({
  kind: z.literal('operator-core'),
  schemaVersion: z.literal(1),
  contentVersion: z.string().min(1),
  traits: z.array(traitSchema),
  reportSections: z.array(reportSectionSchema),
  texts: z.array(reportTextSchema),
  traitTextTables: z.array(traitTextTableSchema),
  conclusions: conclusionMapSchema,
  ci: z.strictObject({ items: z.array(ciItemSchema), key: z.array(ciKeySchema), norms: ciNormsSchema }),
  ce: z.strictObject({ items: z.array(ceItemSchema), scoring: z.array(ceScoringSchema) }),
  profiles: z.array(profileSchema),
  normProfiles: z.array(normProfileSchema),
  /** Opens the examinee pack, and goes in invitation links. It must never be the operator's passphrase. */
  examineePackKey: z.string().min(1).max(128),
  assets,
});

export const manualsPackSchema = z.strictObject({
  kind: z.literal('operator-manuals'),
  schemaVersion: z.literal(1),
  contentVersion: z.string().min(1),
  manuals: z.array(
    z.strictObject({
      id: z.string().min(1),
      module: moduleId,
      code: z.string().min(1),
      title: z.string(),
      html: z.string(),
    }),
  ),
  assets,
});

const instructionLines = z.array(z.string().min(1)).min(1);

export const examineePackSchema = z.strictObject({
  kind: z.literal('examinee'),
  schemaVersion: z.literal(1),
  contentVersion: z.string().min(1),
  ci: z.strictObject({ items: z.array(ciItemSchema) }),
  ce: z.strictObject({ items: z.array(ceItemSchema) }),
  instructions: z.strictObject({ general: instructionLines, color: instructionLines, ci: instructionLines, ce: instructionLines }),
  consent: z.string().min(1),
  assets,
});

export type OperatorPack = z.infer<typeof operatorPackSchema>;
export type ManualsPack = z.infer<typeof manualsPackSchema>;
export type ExamineePack = z.infer<typeof examineePackSchema>;
