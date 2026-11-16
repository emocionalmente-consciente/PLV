// Trait IDs, which never change. `rgo` and `rgow` reuse numbers for different traits, so
// each ID carries its module. Scores use these, never the legacy names (DATA_MODEL.md).

export const P4_TRAITS = {
  actividad: 'p4:13',
  creatividad: 'p4:14',
  independencia: 'p4:15',
  liderazgo: 'p4:16',
  logro: 'p4:17',
  percepcionSalud: 'p4:18',
  perseverancia: 'p4:19',
  responsabilidad: 'p4:20',
  sociabilidad: 'p4:21',
  ceGlobal: 'p4:23',
  autodominio: 'p4:24',
  positividad: 'p4:25',
  autoestima: 'p4:26',
  respuestaEstres: 'p4:27',
  ciGlobal: 'p4:28',
  factorVerbal: 'p4:29',
  factorEspacial: 'p4:30',
  factorNumerico: 'p4:31',
} as const;

export const CE_TRAITS = {
  toleranciaFrustracion: 'ce:13',
  autoValoracion: 'ce:14',
  laboriosidad: 'ce:15',
  optimismo: 'ce:16',
  respuestaSobreEsfuerzo: 'ce:17',
  afanTriunfo: 'ce:18',
  catalizadorCambios: 'ce:19',
  consideracionDemas: 'ce:20',
  influencia: 'ce:21',
  dominioEmpuje: 'ce:22',
  lealtadGrupal: 'ce:23',
  comunicacion: 'ce:24',
  ceIntrapersonal: 'ce:25',
  ceInterpersonal: 'ce:26',
  factorGEmocional: 'ce:27',
} as const;

export interface TraitScore {
  traitId: string;
  value: number;
}
