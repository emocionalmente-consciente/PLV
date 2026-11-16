import type { ExamineeInput } from '../../data/repositories';
import type { Examinee } from '../../data/schemas';

export const EMPTY_EXAMINEE: ExamineeInput = { givenName: '', paternalSurname: '', maternalSurname: '', sex: 'F', birthDate: '' };

export const fullName = (e: Examinee): string => [e.givenName, e.paternalSurname, e.maternalSurname].filter(Boolean).join(' ');
