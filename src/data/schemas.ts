// Local records, following DATA_MODEL.md ("Local database"). These validate a backup before it can
// replace anything, so a damaged or edited file can't put bad rows in the database.
import { z } from 'zod';
import { parseIsoDate } from '../domain/age';
import { profileSchema } from '../content/schemas';
import { testsSchema } from '../invitations/token';

const isoDate = z.string().refine((value) => parseIsoDate(value) !== null);
const ranges = z.record(z.string(), z.strictObject({ min: z.number(), max: z.number() }));

export const examineeSchema = z.strictObject({
  id: z.string().min(1),
  givenName: z.string(),
  paternalSurname: z.string(),
  maternalSurname: z.string(),
  sex: z.enum(['M', 'F']),
  birthDate: isoDate,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sessionSchema = z.strictObject({
  id: z.string().min(1),
  examineeId: z.string().min(1),
  testDate: isoDate,
  ageAtTest: z.number().int().nonnegative(),
  maritalStatus: z.string().nullable(),
  instruments: z.strictObject({ color: z.boolean(), ci: z.boolean(), ce: z.boolean() }),
  profile: z.strictObject({
    id: z.string(),
    name: z.string(),
    hasRanges: z.boolean(),
    ranges,
    /** For a custom profile, the factory profile whose report texts it uses. */
    textProfileId: z.string().optional(),
  }),
  contentVersion: z.string(),
  engineVersion: z.string(),
  normProfileId: z.string(),
  administration: z.enum(['paper', 'screen']),
  textSeed: z.string(),
});

const protocolSide = z.strictObject({ signs: z.string(), marks: z.string(), letters: z.string() });

export const colorResultSchema = z.strictObject({
  sessionId: z.string().min(1),
  serie1: z.string(),
  serie2: z.string(),
  protocol: z.strictObject({ serie1: protocolSide, serie2: protocolSide }),
  qualitative: z.array(z.strictObject({ slot: z.number(), baseCode: z.string(), textId: z.string() })),
});

export const itemAnswerSchema = z.strictObject({
  sessionId: z.string().min(1),
  itemId: z.string().min(1),
  given: z.string().nullable(),
  correct: z.boolean().nullable(),
  points: z.number(),
});

export const scoreSchema = z.strictObject({
  sessionId: z.string().min(1),
  traitId: z.string().min(1),
  value: z.number(),
  textId: z.string().nullable(),
});

export const appMetaSchema = z.strictObject({ key: z.string().min(1), value: z.unknown() });

/** What the operator keeps about a link. The examinee's identity is here, and never in the token. */
export const invitationSchema = z.strictObject({
  id: z.string().min(1),
  examineeId: z.string().min(1),
  tests: testsSchema,
  profileId: z.string().min(1),
  normProfileId: z.string().min(1),
  maritalStatus: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  token: z.string().min(1),
  importedAt: z.string().nullable(),
  sessionId: z.string().nullable(),
});

/** A job profile the user made from another one. It keeps the source's report texts. */
export const customProfileSchema = profileSchema.extend({
  company: z.string(),
  position: z.string().min(1),
  textProfileId: z.string().min(1),
});

export const backupTablesSchema = z.strictObject({
  examinees: z.array(examineeSchema),
  sessions: z.array(sessionSchema),
  colorResults: z.array(colorResultSchema),
  itemAnswers: z.array(itemAnswerSchema),
  scores: z.array(scoreSchema),
  customProfiles: z.array(customProfileSchema),
  appMeta: z.array(appMetaSchema),
  invitations: z.array(invitationSchema),
});

export const backupSchema = z.strictObject({
  kind: z.literal('backup'),
  schemaVersion: z.literal(1),
  databaseVersion: z.literal(1),
  createdAt: z.string(),
  tables: backupTablesSchema,
});

export type Examinee = z.infer<typeof examineeSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type ColorResult = z.infer<typeof colorResultSchema>;
export type ItemAnswer = z.infer<typeof itemAnswerSchema>;
export type Score = z.infer<typeof scoreSchema>;
export type AppMeta = z.infer<typeof appMetaSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type CustomProfile = z.infer<typeof customProfileSchema>;
export type BackupTables = z.infer<typeof backupTablesSchema>;
export type Backup = z.infer<typeof backupSchema>;
