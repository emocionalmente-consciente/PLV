// The titles legacy shows for each manual (ManualesG32.pas).
const TITLES: Record<string, string> = {
  XDP: 'Tutorial de Psicógrafos',
  XMP: 'Fundamentos de Psicógrafos',
  XPE: 'Diseño de Psicógrafos',
  XGT: 'Glosario de Términos',
  XMU: 'Manual del Usuario',
  XGU: 'Guía del Usuario',
  XCI: 'Manual del C.I.',
  XCE: 'Manual del C.E.',
};

export const manualTitle = (code: string, fallback: string): string => TITLES[code] ?? fallback;
