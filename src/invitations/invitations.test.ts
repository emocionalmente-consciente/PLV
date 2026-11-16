import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkExamineePack } from '../content/checks';
import { demoExamineePack, demoOperatorPack } from '../content/demo-content';
import { EXAMINEE_INSTRUCTIONS } from '../content/examinee-text';
import { createBackup, openBackup, applyBackup } from '../data/backup';
import { type PsivDb, createDb } from '../data/db';
import { createExaminee, deleteExamineeCascade } from '../data/repositories';
import type { Examinee, Invitation } from '../data/schemas';
import { applyCe, applyCi, applyColor, newSession } from '../features/capture/build';
import { generateOperatorKeys, publicKeysForToken } from './keys';
import { type OpenedResponse, OPERATOR_KEYS_META, createInvitation, ensureOperatorKeys, importResponse, invitationLink, invitationStatus, openResponse, scoreResponse } from './operator';
import { type ExamineeResponse, openSealedResponse, sealResponse } from './response';
import { InvitationError, fromBase64Url, isAllowedPackUrl, signToken, tokenFromHash, toBase64Url, verifyToken } from './token';

const pack = demoOperatorPack();
const NOW = new Date('2026-03-01T12:00:00.000Z');
const FIRST = '01234567';
const SECOND = '32165470';

const allCe = (): Record<string, 'A' | 'B' | 'C'> => Object.fromEntries(pack.ce.items.map((item) => [item.id, 'A' as const]));

async function claims() {
  const keys = await generateOperatorKeys(NOW);
  return {
    keys,
    claims: { id: crypto.randomUUID(), tests: ['color', 'ci'] as ('color' | 'ci' | 'ce')[], expiresAt: '2026-04-01T00:00:00.000Z', ...(await publicKeysForToken(keys)), packKey: 'demo' },
  };
}

const decode = (token: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[0] ?? ''))) as Record<string, unknown>;

describe('the link token', () => {
  it('round-trips and verifies', async () => {
    const { keys, claims: c } = await claims();
    await expect(verifyToken(await signToken(c, keys.signing.privateJwk))).resolves.toEqual(c);
  });

  it('refuses a changed payload', async () => {
    const { keys, claims: c } = await claims();
    const [, signature] = (await signToken(c, keys.signing.privateJwk)).split('.');
    const forged = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...decode(await signToken(c, keys.signing.privateJwk)), x: '2099-01-01T00:00:00.000Z' })));
    await expect(verifyToken(`${forged}.${String(signature)}`)).rejects.toBeInstanceOf(InvitationError);
  });

  it.each(['', 'abc', 'a.b.c', 'a.b'])('refuses %j', async (token) => {
    await expect(verifyToken(token)).rejects.toBeInstanceOf(InvitationError);
  });

  it('refuses a mix of tests that legacy never allowed', async () => {
    const { keys, claims: c } = await claims();
    await expect(signToken({ ...c, tests: ['ci', 'ce'] }, keys.signing.privateJwk)).rejects.toThrow();
  });

  it('carries the wait between questions, and rejects one out of range', async () => {
    const { keys, claims: c } = await claims();
    await expect(verifyToken(await signToken({ ...c, questionDelaySeconds: 30 }, keys.signing.privateJwk))).resolves.toMatchObject({ questionDelaySeconds: 30 });
    expect(decode(await signToken(c, keys.signing.privateJwk))).not.toHaveProperty('q');
    await expect(signToken({ ...c, questionDelaySeconds: 601 }, keys.signing.privateJwk)).rejects.toThrow();
    await expect(signToken({ ...c, questionDelaySeconds: 1.5 }, keys.signing.privateJwk)).rejects.toThrow();
  });

  it('carries a custom Color gap, including zero, and rejects one out of range', async () => {
    const { keys, claims: c } = await claims();
    await expect(verifyToken(await signToken({ ...c, colorPauseSeconds: 45 }, keys.signing.privateJwk))).resolves.toMatchObject({ colorPauseSeconds: 45 });
    await expect(verifyToken(await signToken({ ...c, colorPauseSeconds: 0 }, keys.signing.privateJwk))).resolves.toMatchObject({ colorPauseSeconds: 0 });
    await expect(signToken({ ...c, colorPauseSeconds: 1801 }, keys.signing.privateJwk)).rejects.toThrow();
  });

  it('finds the token only in an examinee link', () => {
    expect(tokenFromHash('#/e/abc.def')).toBe('abc.def');
    expect(tokenFromHash('#/examinados/1')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('allows a pack only from HTTPS or next to the app', () => {
    expect(isAllowedPackUrl('https://example.com/a.psivpack')).toBe(true);
    expect(isAllowedPackUrl('demo/demo-examinee.psivpack')).toBe(true);
    expect(isAllowedPackUrl('http://example.com/a.psivpack')).toBe(false);
    expect(isAllowedPackUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedPackUrl('//example.com/a')).toBe(false);
  });
});

function response(invitation: Invitation, over: Partial<ExamineeResponse> = {}): ExamineeResponse {
  return {
    kind: 'psiv-response',
    schemaVersion: 1,
    invitationId: invitation.id,
    contentVersion: pack.contentVersion,
    consentAt: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    testDate: '2020-06-15',
    color: { serie1: FIRST, serie2: SECOND },
    ci: {},
    ...over,
  };
}

describe('the sealed response', () => {
  it('opens only with the matching private key', async () => {
    const { keys, claims: c } = await claims();
    const other = await generateOperatorKeys(NOW);
    const body: ExamineeResponse = { kind: 'psiv-response', schemaVersion: 1, invitationId: c.id, contentVersion: 'x', consentAt: NOW.toISOString(), startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), testDate: '2026-03-01', ce: allCe() };
    const code = await sealResponse(body, c.encryptionKey);
    await expect(openSealedResponse(code, keys.encryption.privateJwk)).resolves.toEqual(body);
    await expect(openSealedResponse(code, other.encryption.privateJwk)).rejects.toBeInstanceOf(InvitationError);
  });

  it('survives the line breaks a mail program adds', async () => {
    const { keys, claims: c } = await claims();
    const body: ExamineeResponse = { kind: 'psiv-response', schemaVersion: 1, invitationId: c.id, contentVersion: 'x', consentAt: NOW.toISOString(), startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), testDate: '2026-03-01' };
    const code = await sealResponse(body, c.encryptionKey);
    await expect(openSealedResponse(code.replace(/(.{40})/g, '$1\n'), keys.encryption.privateJwk)).resolves.toEqual(body);
  });

  it('refuses a damaged code', async () => {
    const { keys, claims: c } = await claims();
    const code = await sealResponse({ kind: 'psiv-response', schemaVersion: 1, invitationId: c.id, contentVersion: 'x', consentAt: NOW.toISOString(), startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), testDate: '2026-03-01' }, c.encryptionKey);
    const flipped = code.slice(0, -2) + (code.endsWith('AA') ? 'BB' : 'AA');
    await expect(openSealedResponse(flipped, keys.encryption.privateJwk)).rejects.toBeInstanceOf(InvitationError);
    await expect(openSealedResponse('hola', keys.encryption.privateJwk)).rejects.toBeInstanceOf(InvitationError);
  });

  it('leaks nothing readable', async () => {
    const { claims: c } = await claims();
    const code = await sealResponse({ kind: 'psiv-response', schemaVersion: 1, invitationId: c.id, contentVersion: 'x', consentAt: NOW.toISOString(), startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), testDate: '2026-03-01', color: { serie1: FIRST, serie2: SECOND } }, c.encryptionKey);
    expect(code).not.toContain(FIRST);
    expect(code).not.toContain(c.id);
  });
});

describe('invitations in the operator database', () => {
  let db: PsivDb;
  let examinee: Examinee;
  const input = { tests: ['color', 'ci'] as ('color' | 'ci' | 'ce')[], profileId: 'factory:2', normProfileId: 'latam', maritalStatus: 'SOLTERA', expiresInDays: 14, packUrl: null };

  beforeEach(async () => {
    db = createDb(`inv-${crypto.randomUUID()}`);
    examinee = await createExaminee(db, { givenName: 'Ximena', paternalSurname: 'Quiroga', maternalSurname: 'Zubieta', sex: 'F', birthDate: '1990-06-15' }, NOW);
  });

  const sealFor = async (invitation: Invitation, over: Partial<ExamineeResponse> = {}): Promise<string> => {
    const c = await verifyToken(invitation.token);
    return sealResponse(response(invitation, over), c.encryptionKey);
  };

  it('keeps the same keys, because new ones would orphan pending results', async () => {
    const first = await ensureOperatorKeys(db, NOW);
    expect(await ensureOperatorKeys(db, new Date())).toEqual(first);
  });

  it('puts no personal data, answer key or passphrase in the token', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const decoded = JSON.stringify(decode(invitation.token));
    expect(Object.keys(decode(invitation.token)).sort()).toEqual(['e', 'i', 'k', 's', 't', 'v', 'x']);
    for (const value of ['Ximena', 'Quiroga', 'Zubieta', '1990-06-15', examinee.id, 'SOLTERA', 'factory:2', 'latam']) expect(decoded).not.toContain(value);
    expect(decoded).not.toContain(pack.ci.key.map((k) => k.answer).join(''));
    expect(decoded).not.toContain('"d"');
  });

  it('builds the link from the page address', () => {
    expect(invitationLink('abc', { origin: 'https://x.io', pathname: '/PLV/' })).toBe('https://x.io/PLV/#/e/abc');
  });

  it('gives the status of an invitation', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    expect(invitationStatus(invitation, NOW)).toBe('pending');
    expect(invitationStatus(invitation, new Date('2026-04-01T00:00:00.000Z'))).toBe('expired');
    expect(invitationStatus({ ...invitation, importedAt: NOW.toISOString() }, NOW)).toBe('imported');
  });

  it('scores a screen response exactly as the same answers captured by hand', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const right = pack.ci.key.slice(0, 20);
    const ci = Object.fromEntries(right.map((k) => [k.itemId, k.answer]));
    const opened = await openResponse(db, pack, await sealFor(invitation, { ci }));
    expect(opened.problems).toEqual([]);
    const record = scoreResponse(pack, opened, 's-1', '2020-06-15', []);

    const paper = newSession(pack, { id: 's-1', examineeId: examinee.id, birthDate: examinee.birthDate, testDate: '2020-06-15', maritalStatus: 'SOLTERA', profileId: 'factory:2', normProfileId: 'latam' });
    const captured = applyCi(pack, applyColor(pack, { session: paper }, FIRST, SECOND), new Set(right.map((k) => k.itemId)));
    expect(record.scores).toEqual(captured.scores);
    expect(record.colorResult).toEqual(captured.colorResult);
    expect(record.session.administration).toBe('screen');
    expect(record.itemAnswers?.filter((a) => a.correct)).toHaveLength(20);
    expect(record.itemAnswers?.find((a) => a.itemId === right[0]?.itemId)?.given).toBe(right[0]?.answer);
  });

  it('counts a wrong or blank CI answer as wrong, and keeps what was given', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const first = pack.ci.key[0];
    if (!first) throw new Error('fixture');
    const opened = await openResponse(db, pack, await sealFor(invitation, { ci: { [first.itemId]: 'zz' } }));
    const answers = scoreResponse(pack, opened, 's-1', '2020-06-15', []).itemAnswers ?? [];
    expect(answers).toHaveLength(36);
    expect(answers.filter((a) => a.correct)).toEqual([]);
    expect(answers.find((a) => a.itemId === first.itemId)?.given).toBe('zz');
    expect(answers.filter((a) => a.given === null)).toHaveLength(35);
  });

  it('accepts a number with a leading zero', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const numeric = pack.ci.key.find((k) => k.factor === 'numeric');
    if (!numeric) throw new Error('fixture');
    const opened = await openResponse(db, pack, await sealFor(invitation, { ci: { [numeric.itemId]: `0${numeric.answer}` } }));
    expect(scoreResponse(pack, opened, 's-1', '2020-06-15', []).itemAnswers?.filter((a) => a.correct)).toHaveLength(1);
  });

  it('scores CE with both color series, like a captured CE', async () => {
    const invitation = await createInvitation(db, pack, { ...input, tests: ['ce'], examineeId: examinee.id }, NOW);
    const c = await verifyToken(invitation.token);
    const body = response(invitation, { ce: allCe() });
    delete body.ci;
    const opened = await openResponse(db, pack, await sealResponse(body, c.encryptionKey));
    expect(opened.problems).toEqual([]);
    const paper = newSession(pack, { id: 's-1', examineeId: examinee.id, birthDate: examinee.birthDate, testDate: '2020-06-15', maritalStatus: 'SOLTERA', profileId: 'factory:2', normProfileId: 'latam' });
    expect(scoreResponse(pack, opened, 's-1', '2020-06-15', []).scores).toEqual(applyCe(pack, { session: paper }, FIRST, SECOND, allCe()).scores);
  });

  it('reports a response that does not match its invitation', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const c = await verifyToken(invitation.token);
    const noColor = response(invitation);
    delete noColor.color;
    const opened: OpenedResponse = await openResponse(db, pack, await sealResponse(noColor, c.encryptionKey));
    expect(opened.problems).not.toEqual([]);
    const unknown = await openResponse(db, pack, await sealFor(invitation, { ci: { 'ci:999': 'a' } }));
    expect(unknown.problems).not.toEqual([]);
  });

  it('imports once, and links the session', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const code = await sealFor(invitation);
    const opened = await openResponse(db, pack, code);
    await importResponse(db, scoreResponse(pack, opened, 's-1', '2020-06-15', []), invitation.id, NOW);
    expect(await db.sessions.get('s-1')).toBeDefined();
    expect((await db.invitations.get(invitation.id))?.sessionId).toBe('s-1');
    await expect(openResponse(db, pack, code)).rejects.toMatchObject({ code: 'already-imported' });
    await expect(importResponse(db, scoreResponse(pack, opened, 's-2', '2020-06-15', []), invitation.id, NOW)).rejects.toMatchObject({ code: 'already-imported' });
    expect(await db.sessions.get('s-2')).toBeUndefined();
  });

  it('refuses a response when this browser has no keys or no invitation', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const code = await sealFor(invitation);
    await db.invitations.clear();
    await expect(openResponse(db, pack, code)).rejects.toMatchObject({ code: 'unknown-invitation' });
    await db.appMeta.delete(OPERATOR_KEYS_META);
    await expect(openResponse(db, pack, code)).rejects.toMatchObject({ code: 'no-keys' });
  });

  it('can still open pending results after restoring a backup in a new browser', async () => {
    const invitation = await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    const code = await sealFor(invitation);
    const file = await createBackup(db, 'una frase larga de prueba', NOW, 1000);
    const other = createDb(`inv-${crypto.randomUUID()}`);
    await applyBackup(other, (await openBackup(file, 'una frase larga de prueba', 1000)).backup);
    await expect(openResponse(other, pack, code)).resolves.toMatchObject({ problems: [] });
  });

  it('removes invitations with their examinee', async () => {
    await createInvitation(db, pack, { ...input, examineeId: examinee.id }, NOW);
    await deleteExamineeCascade(db, examinee.id);
    expect(await db.invitations.count()).toBe(0);
  });
});

describe('the examinee pack', () => {
  it('passes its checks, with no key or scoring', () => {
    expect(checkExamineePack(demoExamineePack(), pack)).toEqual([]);
  });

  it('never asks for the favorite color', () => {
    const favorite = EXAMINEE_INSTRUCTIONS.color.filter((line) => /favorit/i.test(line));
    expect(favorite).toHaveLength(1);
    expect(favorite[0]).toMatch(/^No se trata de elegir su color favorito/);
  });

  it('reports a CI key the examinee could not enter', () => {
    const operator = demoOperatorPack();
    const choice = operator.ci.key.find((k) => k.factor === 'verbal');
    const numeric = operator.ci.key.find((k) => k.factor === 'numeric');
    if (!choice || !numeric) throw new Error('fixture');
    choice.answer = 'z';
    numeric.answer = 'x';
    const problems = checkExamineePack(demoExamineePack(), operator);
    expect(problems).toContain(`${choice.itemId}: the key is not one of the options`);
    expect(problems).toContain(`${numeric.itemId}: the key is not a whole number`);
  });
});
