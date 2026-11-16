// The build checks from DATA_MODEL.md ("Build pack checks"). They return a list of problems without
// quoting content, so their output is safe to print. An empty list means the pack passed.
import { CE_FACTOR_TRAITS } from '../domain/ce/score';
import { isValidSerie } from '../domain/color/protocol';
import type { ExamineePack, ManualsPack, OperatorPack } from './schemas';

const code = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}`);

/** Every base code the qualitative selector can ask for, including those the rules can't reach. */
export const QUALITATIVE_BASE_CODES = [
  'CA00',
  ...code('CB', 1, 9),
  ...code('CC', 0, 33),
  ...code('CD', 0, 31),
  ...code('CE', 1, 3),
  'CF00',
  ...code('CG', 1, 10),
  ...code('CH', 1, 14),
  'CJ00',
  ...code('CK', 1, 5),
  'CL00',
];

/** Traits with no text, as CI factors have none. */
export const TRAITS_WITHOUT_TEXT = new Set(['p4:28', 'p4:29', 'p4:30', 'p4:31']);

const REFERENCE_TOTAL = 100;
const REFERENCE_TOLERANCE = 0.05;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7'];

/** Norm profiles: both present, internally consistent, and Europa kept as a reference only. */
export function normProfileProblems(profiles: OperatorPack['normProfiles']): string[] {
  const problems: string[] = [];
  for (const id of ['latam', 'europa-luscher']) {
    if (!profiles.some((p) => p.id === id)) problems.push(`Norm profile ${id} is missing`);
  }
  for (const profile of profiles) {
    const add = (message: string): void => void problems.push(`${profile.id}: ${message}`);
    if (!DIGITS.every((digit) => typeof profile.colorReference[digit] === 'number')) add('colorReference needs the eight colors');
    const total = DIGITS.reduce((sum, digit) => sum + (profile.colorReference[digit] ?? 0), 0);
    if (Math.abs(total - REFERENCE_TOTAL) > REFERENCE_TOLERANCE) add(`colorReference sums to ${String(total)}`);
    if (!isValidSerie(profile.colorOrder)) add('colorOrder is not a permutation');
    else {
      const percents = [...profile.colorOrder].map((digit) => profile.colorReference[digit] ?? 0);
      if (percents.some((value, i) => i > 0 && value > (percents[i - 1] ?? 0))) add("colorOrder doesn't follow the percentages");
    }
    for (const note of profile.interpretiveNotes) {
      if (!DIGITS.includes(note.digit)) add(`note ${note.id} has an unknown color`);
      if (note.positions.length === 0 || !note.positions.every((p) => Number.isInteger(p) && p >= 1 && p <= 8)) add(`note ${note.id} has an invalid place`);
    }
    if (profile.id === 'europa-luscher') {
      if (profile.interpretiveNotes.length > 0) add('must have no México-only notes');
      if (profile.status !== 'reference-only') add('must stay reference-only until a psychologist signs off');
    }
  }
  return problems;
}

const CI_ITEMS = 36;
const CI_ITEMS_PER_FACTOR = 12;
const CE_ITEMS = 30;
const CE_ITEMS_PER_TRAIT = 5;
const LAST_RAW_SCORE = 36;
const ALLOWED_TAG = /^(p|strong|em|u|img)$/;

/** Tags limited to the allowed list, and attributes to alignment and images. */
export function htmlProblems(html: string): string[] {
  const problems: string[] = [];
  for (const match of html.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
    const tag = match[1] ?? '';
    const attributes = match[2] ?? '';
    if (!ALLOWED_TAG.test(tag)) problems.push(`tag not allowed: ${tag}`);
    for (const attribute of attributes.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      const name = attribute[1] ?? '';
      const value = attribute[2] ?? '';
      const fine =
        (tag === 'p' && name === 'style' && /^text-align:(left|right|center|justify)$/.test(value)) ||
        (tag === 'img' && ((name === 'src' && /^images\/[\w.-]+\.png$/.test(value)) || name === 'alt'));
      if (!fine) problems.push(`attribute not allowed: ${tag}.${name}`);
    }
  }
  return problems;
}

function missingImages(html: string, assets: Record<string, string>): string[] {
  return [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1] ?? '').filter((src) => !(src in assets));
}

export function checkOperatorPack(pack: OperatorPack, allowedEmptyTexts: ReadonlySet<string> = new Set()): string[] {
  const problems: string[] = [];
  const add = (message: string): void => void problems.push(message);

  // Item and norm counts.
  if (pack.ci.items.length !== CI_ITEMS) add(`CI has ${String(pack.ci.items.length)} items, expected ${String(CI_ITEMS)}`);
  if (pack.ce.items.length !== CE_ITEMS) add(`CE has ${String(pack.ce.items.length)} items, expected ${String(CE_ITEMS)}`);
  for (const item of pack.ce.items) {
    if (item.options.map((o) => o.key).join('') !== 'ABC') add(`${item.id} doesn't have options A, B and C`);
  }
  if (pack.ci.norms.bands.length !== 3) add(`CI norms have ${String(pack.ci.norms.bands.length)} bands, expected 3`);
  for (const band of pack.ci.norms.bands) {
    const table = pack.ci.norms.table[band.id] ?? [];
    const complete = table.length === LAST_RAW_SCORE + 1 && table.every((v) => Number.isFinite(v));
    if (!complete) add(`CI norm band ${band.id} doesn't cover raw scores 0-36 without gaps`);
  }

  // Items and their keys.
  const ciIds = new Set(pack.ci.items.map((i) => i.id));
  const keyed = new Set(pack.ci.key.map((k) => k.itemId));
  if (keyed.size !== pack.ci.key.length || keyed.size !== ciIds.size || ![...keyed].every((id) => ciIds.has(id))) {
    add('CI key must have exactly one row per item');
  }
  for (const item of pack.ci.items) {
    if (!(item.imageAsset in pack.assets)) add(`${item.id} image asset is missing`);
    const key = pack.ci.key.find((k) => k.itemId === item.id);
    if (key && item.answer.kind === 'choice' && !item.answer.options.includes(key.answer)) add(`${item.id} key isn't one of its options`);
    if (key && item.answer.kind === 'number' && !/^\d+$/.test(key.answer)) add(`${item.id} key isn't a number`);
  }

  for (const factor of ['verbal', 'numeric', 'spatial'] as const) {
    const count = pack.ci.key.filter((k) => k.factor === factor).length;
    if (count !== CI_ITEMS_PER_FACTOR) add(`CI factor ${factor} has ${String(count)} items, expected ${String(CI_ITEMS_PER_FACTOR)}`);
  }

  // CE scoring.
  const ceIds = new Set(pack.ce.items.map((i) => i.id));
  const scored = new Set(pack.ce.scoring.map((s) => s.itemId));
  if (scored.size !== pack.ce.scoring.length || scored.size !== ceIds.size || ![...scored].every((id) => ceIds.has(id))) {
    add('CE scoring must have exactly one row per item');
  }
  for (const trait of CE_FACTOR_TRAITS) {
    const count = pack.ce.scoring.filter((s) => s.traitId === trait).length;
    if (count !== CE_ITEMS_PER_TRAIT) add(`${trait} has ${String(count)} CE items, expected ${String(CE_ITEMS_PER_TRAIT)}`);
  }

  // Conclusions.
  const textCodes = new Set(pack.texts.map((t) => t.baseCode));
  for (const serie of Object.keys(pack.conclusions.exceptions)) {
    if (!isValidSerie(serie)) add('A conclusions exception is not a valid permutation');
  }
  for (const value of new Set([pack.conclusions.defaultCode, ...Object.values(pack.conclusions.exceptions)])) {
    if (!textCodes.has(value)) add(`Conclusion code ${value} has no text`);
  }

  // Base codes and references.
  for (const base of QUALITATIVE_BASE_CODES) {
    if (!pack.texts.some((t) => t.baseCode === base && t.variant !== null)) add(`Base code ${base} has no text with a variant`);
  }
  const textIds = new Set(pack.texts.map((t) => t.id));
  if (textIds.size !== pack.texts.length) add('Text IDs are not unique');
  const traitIds = new Set(pack.traits.map((t) => t.id));
  if (traitIds.size !== pack.traits.length) add('Trait IDs are not unique');
  const profileIds = new Set(pack.profiles.map((p) => p.id));
  for (const table of pack.traitTextTables) {
    if (!traitIds.has(table.traitId)) add(`Text table refers to unknown trait ${table.traitId}`);
    for (const profile of table.profileIds ?? []) {
      if (!profileIds.has(profile)) add(`Text table refers to unknown profile ${profile}`);
    }
    for (const band of table.bands) {
      if (band.min > band.max) add(`${table.traitId} has a band with min above max`);
      for (const id of band.textIds) if (!textIds.has(id)) add(`${table.traitId} refers to unknown text ${id}`);
    }
  }
  for (const trait of pack.traits) {
    const has = pack.traitTextTables.some((t) => t.traitId === trait.id);
    if (!TRAITS_WITHOUT_TEXT.has(trait.id) && !has) add(`${trait.id} has no text table`);
    if (TRAITS_WITHOUT_TEXT.has(trait.id) && has) add(`${trait.id} should have no text table`);
  }

  // Profiles.
  for (const profile of pack.profiles) {
    for (const trait of pack.traits.filter((t) => profile.modules.includes(t.module))) {
      if (!(trait.id in profile.ranges)) add(`${profile.id} has no range for ${trait.id}`);
    }
    for (const id of Object.keys(profile.ranges)) if (!traitIds.has(id)) add(`${profile.id} refers to unknown trait ${id}`);
  }

  problems.push(...normProfileProblems(pack.normProfiles));

  // Text bodies.
  const referenced = new Set(pack.traitTextTables.flatMap((t) => t.bands.flatMap((b) => b.textIds)));
  for (const text of pack.texts) {
    for (const problem of htmlProblems(text.html)) add(`${text.id}: ${problem}`);
    for (const src of missingImages(text.html, pack.assets)) add(`${text.id}: image ${src} is missing`);
    const empty = text.html.replace(/<[^>]*>/g, '').trim() === '';
    if (empty && !allowedEmptyTexts.has(text.id)) add(`${text.id} is empty`);
    if (empty && !referenced.has(text.id)) add(`${text.id} is empty and unused`);
  }
  return problems;
}

export function checkManualsPack(pack: ManualsPack): string[] {
  const problems: string[] = [];
  for (const manual of pack.manuals) {
    for (const problem of htmlProblems(manual.html)) problems.push(`${manual.id}: ${problem}`);
    for (const src of missingImages(manual.html, pack.assets)) problems.push(`${manual.id}: image ${src} is missing`);
  }
  return problems;
}

/** Field names that would mean scoring content had reached the examinee pack. */
const EXAMINEE_FORBIDDEN_FIELDS = /^(key|scoring|norms|texts|traits|profiles|factor|points|traitId|reportCode|conclusions|traitTextTables|manuals|normProfiles|colorReference)$/;

export function checkExamineePack(pack: ExamineePack, operator?: OperatorPack): string[] {
  const problems: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const [field, inner] of Object.entries(value)) {
        // A CE option has a `key` that only names it: A, B or C.
        const isOptionKey = field === 'key' && typeof inner === 'string';
        if (field !== 'assets' && !isOptionKey && EXAMINEE_FORBIDDEN_FIELDS.test(field)) problems.push(`Examinee pack has a field named ${field}`);
        if (field !== 'assets') visit(inner);
      }
    }
  };
  visit(pack);
  if (pack.ci.items.length !== CI_ITEMS) problems.push('Examinee CI item count is wrong');
  if (pack.ce.items.length !== CE_ITEMS) problems.push('Examinee CE item count is wrong');
  if (operator) {
    const json = JSON.stringify({ ...pack, assets: {} });
    const longTexts = operator.texts.map((t) => t.html.replace(/<[^>]*>/g, '').trim()).filter((t) => t.length >= 30);
    if (longTexts.some((text) => json.includes(JSON.stringify(text).slice(1, -1)))) problems.push('Examinee pack contains a report text');
    const allowedAssets = new Set(operator.ci.items.map((i) => i.imageAsset));
    if (!Object.keys(pack.assets).every((name) => allowedAssets.has(name))) problems.push('Examinee pack has an asset that is not a CI item image');
    // On screen the answer is compared with the key, so each key must be something the examinee can give.
    for (const { itemId, answer } of operator.ci.key) {
      const format = pack.ci.items.find((item) => item.id === itemId)?.answer;
      if (format?.kind === 'choice' && !format.options.includes(answer)) problems.push(`${itemId}: the key is not one of the options`);
      if (format?.kind === 'number' && !/^\d+$/.test(answer)) problems.push(`${itemId}: the key is not a whole number`);
    }
    if (JSON.stringify({ ...pack, assets: {} }).includes(operator.ci.key.map((k) => k.answer).join(''))) problems.push('Examinee pack contains the CI key');
  }
  return problems;
}
