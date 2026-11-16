// Rules for job profiles, with no React or database. Factory profiles come from the pack and are
// read-only. Custom ones live in the local database and are always created from another profile.
import type { OperatorPack } from '../../content/schemas';
import { normalizeName } from '../../data/repositories';
import type { CustomProfile } from '../../data/schemas';
import { P4_TRAITS } from '../../domain/traits';

export type Ranges = Record<string, { min: number; max: number }>;
export type AnyProfile = OperatorPack['profiles'][number] | CustomProfile;

const CI_TRAITS = new Set<string>([P4_TRAITS.ciGlobal, P4_TRAITS.factorVerbal, P4_TRAITS.factorNumerico, P4_TRAITS.factorEspacial]);

/** Legacy limits: 150 for the CI traits and 100 for the rest. */
export const traitTop = (traitId: string): number => (CI_TRAITS.has(traitId) ? 150 : 100);

export const isCustom = (profile: AnyProfile): profile is CustomProfile => 'textProfileId' in profile;

/** `Empresa/Puesto`, or only the position with no company, as legacy shows it. */
export function profileName(company: string, position: string): string {
  const trimmed = company.trim();
  return trimmed ? `${trimmed}/${position.trim()}` : position.trim();
}

/** The name shown as "Puesto" on reports. */
export const positionOf = (profile: AnyProfile): string => (isCustom(profile) ? profile.position : profile.name);

export const allProfiles = (pack: OperatorPack, custom: readonly CustomProfile[]): AnyProfile[] => [...pack.profiles, ...custom];

export const isNameTaken = (name: string, existing: readonly AnyProfile[], exceptId?: string): boolean =>
  existing.some((p) => p.id !== exceptId && normalizeName(p.name) === normalizeName(name));

export type RangeProblem = 'not-a-number' | 'out-of-range' | 'minimum-above-maximum';

/**
 * Equal values are allowed. Legacy tried to require the minimum to be lower, but factory profiles
 * have traits with equal values, so a stricter rule would reject an exact copy of one.
 */
export function rangeProblem(traitId: string, minimum: string, maximum: string): RangeProblem | null {
  if (!/^\d{1,3}$/.test(minimum.trim()) || !/^\d{1,3}$/.test(maximum.trim())) return 'not-a-number';
  const [min, max] = [Number(minimum), Number(maximum)];
  const top = traitTop(traitId);
  if (min > top || max > top) return 'out-of-range';
  return min > max ? 'minimum-above-maximum' : null;
}

export function newCustomProfile(id: string, source: AnyProfile, company: string, position: string): CustomProfile {
  return {
    id,
    name: profileName(company, position),
    locked: false,
    hasRanges: true,
    modules: ['p4', 'ce'],
    ranges: structuredClone(source.ranges),
    company: company.trim(),
    position: position.trim(),
    // Report texts vary by profile for a few traits, so a copy keeps using the factory profile's.
    textProfileId: isCustom(source) ? source.textProfileId : source.id,
  };
}
