import { isCompleteSerie } from '../../domain/color/serie';
import type { Instrument } from './build';

export const INSTRUMENT_LABELS: Record<Instrument, string> = { color: 'Colores', ci: 'C.I.', ce: 'C.E.' };

export const instrumentPath = (sessionId: string, instrument: Instrument): string => `/sesiones/${sessionId}/${instrument}`;

export const seriesComplete = (serie1: string, serie2: string): boolean => isCompleteSerie(serie1) && isCompleteSerie(serie2);

export const SAVE_ERROR = 'No se pudo guardar. Tus datos anteriores no cambiaron. Inténtalo de nuevo.';

export const summaryPath = (sessionId: string): string => `/sesiones/${sessionId}`;
