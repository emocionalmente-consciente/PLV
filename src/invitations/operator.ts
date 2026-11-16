// The operator's side of an invitation: creating the link, opening a response and scoring it.
// Scoring runs only here, because only the operator's pack has the keys and norms.
import type { OperatorPack } from '../content/schemas';
import type { PsivDb } from '../data/db';
import { type SessionRecord, saveSessionRecord } from '../data/repositories';
import type { CustomProfile, Examinee, Invitation } from '../data/schemas';
import { applyCe, applyCiAnswers, applyColor, newSession } from '../features/capture/build';
import { type OperatorKeys, generateOperatorKeys, operatorKeysSchema, publicKeysForToken } from './keys';
import { type ExamineeResponse, openSealedResponse } from './response';
import { DEFAULT_COLOR_PAUSE_SECONDS, InvitationError, type InvitedTest, isAllowedPackUrl, signToken } from './token';

export const OPERATOR_KEYS_META = 'operatorKeys';
const DAY_MS = 86_400_000;

async function readKeys(db: PsivDb): Promise<OperatorKeys | null> {
  const row = await db.appMeta.get(OPERATOR_KEYS_META);
  return row ? operatorKeysSchema.parse(row.value) : null;
}

/** Existing keys are never replaced, because that would orphan every pending invitation. */
export async function ensureOperatorKeys(db: PsivDb, now = new Date()): Promise<OperatorKeys> {
  const existing = await readKeys(db);
  if (existing) return existing;
  // WebCrypto can't run inside a Dexie transaction, so the keys are made first.
  const fresh = await generateOperatorKeys(now);
  return db.transaction('rw', db.appMeta, async () => {
    const raced = await db.appMeta.get(OPERATOR_KEYS_META);
    if (raced) return operatorKeysSchema.parse(raced.value);
    await db.appMeta.add({ key: OPERATOR_KEYS_META, value: fresh });
    return fresh;
  });
}

export interface InvitationInput {
  examineeId: string;
  tests: InvitedTest[];
  profileId: string;
  normProfileId: string;
  maritalStatus: string | null;
  expiresInDays: number;
  packUrl: string | null;
  questionDelaySeconds?: number;
  colorPauseSeconds?: number;
}

export async function createInvitation(db: PsivDb, pack: OperatorPack, input: InvitationInput, now = new Date()): Promise<Invitation> {
  if (input.packUrl !== null && !isAllowedPackUrl(input.packUrl)) throw new RangeError('Pack URL not allowed');
  const keys = await ensureOperatorKeys(db, now);
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + input.expiresInDays * DAY_MS).toISOString();
  const token = await signToken(
    { id, tests: input.tests, expiresAt, ...(await publicKeysForToken(keys)), packKey: pack.examineePackKey, ...(input.packUrl ? { packUrl: input.packUrl } : {}), ...(input.questionDelaySeconds ? { questionDelaySeconds: input.questionDelaySeconds } : {}), ...(input.colorPauseSeconds !== undefined && input.colorPauseSeconds !== DEFAULT_COLOR_PAUSE_SECONDS ? { colorPauseSeconds: input.colorPauseSeconds } : {}) },
    keys.signing.privateJwk,
  );
  const invitation: Invitation = {
    id,
    examineeId: input.examineeId,
    tests: input.tests,
    profileId: input.profileId,
    normProfileId: input.normProfileId,
    maritalStatus: input.maritalStatus,
    createdAt: now.toISOString(),
    expiresAt,
    token,
    importedAt: null,
    sessionId: null,
  };
  await db.invitations.add(invitation);
  return invitation;
}

/** The address to send, built from where the app is running. */
export function invitationLink(token: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}#/e/${token}`;
}

export type InvitationStatus = 'pending' | 'expired' | 'imported';

export function invitationStatus(invitation: Invitation, now = new Date()): InvitationStatus {
  if (invitation.importedAt !== null) return 'imported';
  return now.toISOString() > invitation.expiresAt ? 'expired' : 'pending';
}

/** Why a response can't be scored for this invitation. An empty list means it can. */
export function responseProblems(response: ExamineeResponse, invitation: Invitation, pack: OperatorPack): string[] {
  const problems: string[] = [];
  const { tests } = invitation;
  const wantsColor = tests.includes('color') || tests.includes('ce');
  if (wantsColor !== Boolean(response.color)) problems.push('Las series de colores no corresponden a esta invitación.');
  if (tests.includes('ci') !== Boolean(response.ci)) problems.push('Las respuestas de C.I. no corresponden a esta invitación.');
  if (tests.includes('ce') !== Boolean(response.ce)) problems.push('Las respuestas de C.E. no corresponden a esta invitación.');
  const ciIds = new Set(pack.ci.items.map((item) => item.id));
  if (Object.keys(response.ci ?? {}).some((id) => !ciIds.has(id))) problems.push('Hay respuestas de C.I. para preguntas que no están en el paquete abierto.');
  if (response.ce) {
    const answered = Object.keys(response.ce);
    const ceIds = new Set(pack.ce.items.map((item) => item.id));
    if (answered.length !== ceIds.size || answered.some((id) => !ceIds.has(id))) problems.push('Las respuestas de C.E. no coinciden con las preguntas del paquete abierto.');
  }
  return problems;
}

export interface OpenedResponse {
  response: ExamineeResponse;
  invitation: Invitation;
  examinee: Examinee;
  problems: string[];
}

/** Decrypts a response and finds its invitation. Nothing is saved yet, so the operator can review it. */
export async function openResponse(db: PsivDb, pack: OperatorPack, code: string): Promise<OpenedResponse> {
  const keys = await readKeys(db);
  if (!keys) throw new InvitationError('no-keys', 'Este navegador no tiene las claves de invitación. Restaura el respaldo que las contiene.');
  const response = await openSealedResponse(code, keys.encryption.privateJwk);
  const invitation = await db.invitations.get(response.invitationId);
  const examinee = invitation ? await db.examinees.get(invitation.examineeId) : undefined;
  if (!invitation || !examinee) throw new InvitationError('unknown-invitation', 'Esta respuesta es de una invitación que no está en este navegador.');
  if (invitation.importedAt !== null) throw new InvitationError('already-imported', 'Esta invitación ya se importó. Cada invitación admite una sola respuesta.');
  return { response, invitation, examinee, problems: responseProblems(response, invitation, pack) };
}

/** Builds the session with the same rules as the operator's own capture. */
export function scoreResponse(pack: OperatorPack, opened: OpenedResponse, sessionId: string, testDate: string, customProfiles: readonly CustomProfile[]): SessionRecord {
  const { response, invitation, examinee } = opened;
  const session = newSession(
    pack,
    {
      id: sessionId,
      examineeId: examinee.id,
      birthDate: examinee.birthDate,
      testDate,
      maritalStatus: invitation.maritalStatus,
      profileId: invitation.profileId,
      normProfileId: invitation.normProfileId,
      administration: 'screen',
    },
    customProfiles,
  );
  let record: SessionRecord = { session };
  if (response.ce && response.color) return applyCe(pack, record, response.color.serie1, response.color.serie2, response.ce);
  if (response.color) record = applyColor(pack, record, response.color.serie1, response.color.serie2);
  if (response.ci) record = applyCiAnswers(pack, record, response.ci);
  return record;
}

/** Saves the session and closes the invitation together. The first response imported is the one kept. */
export async function importResponse(db: PsivDb, record: SessionRecord, invitationId: string, now = new Date()): Promise<void> {
  await db.transaction('rw', [db.invitations, db.examinees, db.sessions, db.colorResults, db.itemAnswers, db.scores], async () => {
    const invitation = await db.invitations.get(invitationId);
    if (!invitation) throw new InvitationError('unknown-invitation', 'La invitación ya no existe.');
    if (invitation.importedAt !== null) throw new InvitationError('already-imported', 'Esta invitación ya se importó.');
    await saveSessionRecord(db, record);
    await db.invitations.put({ ...invitation, importedAt: now.toISOString(), sessionId: record.session.id });
  });
}
