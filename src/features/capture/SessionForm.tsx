import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { listCustomProfiles, saveSessionRecord } from '../../data/repositories';
import type { CustomProfile, Examinee } from '../../data/schemas';
import { calculateAge, todayIso } from '../../domain/age';
import { DEFAULT_NORM_PROFILE } from '../../domain/version';
import { fullName } from '../examinees/names';
import { type Instrument, ciAgeAllowed, maritalOptions, newSession, testDateProblem } from './build';
import { INSTRUMENT_LABELS, instrumentPath } from './labels';

interface Fields {
  start: Instrument;
  testDate: string;
  profileId: string;
  maritalStatus: string;
  normProfileId: string;
}

const DATE_MESSAGES = {
  invalid: 'Escribe una fecha válida.',
  'before-birth': 'La fecha de la prueba es anterior a la fecha de nacimiento.',
  'in-the-future': 'La fecha de la prueba no puede ser posterior a hoy.',
};

function Form({ examinee }: { examinee: Examinee }) {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const today = todayIso();
  const options = maritalOptions(examinee.sex);
  const { register, handleSubmit, setError, control, formState } = useForm<Fields>({
    defaultValues: { start: 'color', testDate: today, profileId: pack.profiles[0]?.id ?? '', maritalStatus: options[0] ?? '', normProfileId: DEFAULT_NORM_PROFILE },
  });
  const { errors, isSubmitting } = formState;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);

  useEffect(() => {
    listCustomProfiles(db)
      .then(setCustomProfiles)
      .catch(() => {
        setSaveError('No se pudieron leer los perfiles propios.');
      });
  }, [db]);

  const testDate = useWatch({ control, name: 'testDate' });
  const age = testDateProblem(testDate, examinee.birthDate, today) === null ? calculateAge(examinee.birthDate, testDate) : null;

  const submit = async (fields: Fields): Promise<void> => {
    const problem = testDateProblem(fields.testDate, examinee.birthDate, today);
    if (problem) {
      setError('testDate', { message: DATE_MESSAGES[problem] });
      return;
    }
    if (fields.start === 'ci' && age !== null && !ciAgeAllowed(pack, age)) {
      setError('start', { message: `No se puede calificar el C.I. con una edad de ${String(age)} años.` });
      return;
    }
    try {
      const session = newSession(pack, {
        id: crypto.randomUUID(),
        examineeId: examinee.id,
        birthDate: examinee.birthDate,
        testDate: fields.testDate,
        maritalStatus: fields.maritalStatus,
        profileId: fields.profileId,
        normProfileId: fields.normProfileId,
      }, customProfiles);
      await saveSessionRecord(db, { session });
      void navigate(instrumentPath(session.id, fields.start));
    } catch {
      setSaveError('No se pudo crear la sesión. Inténtalo de nuevo.');
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="stack" aria-label="Nueva sesión">
      <label htmlFor="session-start">Prueba</label>
      <select id="session-start" {...register('start')}>
        {(['color', 'ci', 'ce'] as const).map((instrument) => (
          <option key={instrument} value={instrument}>
            {INSTRUMENT_LABELS[instrument]}
          </option>
        ))}
      </select>
      {errors.start?.message && (
        <p role="alert" className="field-error">
          {errors.start.message}
        </p>
      )}

      <label htmlFor="session-date">Fecha de la prueba</label>
      <input id="session-date" type="date" max={today} {...register('testDate')} />
      {errors.testDate?.message && (
        <p role="alert" className="field-error">
          {errors.testDate.message}
        </p>
      )}
      {age !== null && <p className="muted">Edad en la fecha de la prueba: {String(age)} años</p>}

      <label htmlFor="session-profile">Perfil del puesto</label>
      <select id="session-profile" {...register('profileId')}>
        {[...pack.profiles, ...customProfiles].map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>

      <label htmlFor="session-norm">Referencia</label>
      <select id="session-norm" {...register('normProfileId')}>
        {pack.normProfiles.map((norm) => (
          <option key={norm.id} value={norm.id}>
            {norm.name}
          </option>
        ))}
      </select>

      <label htmlFor="session-marital">Estado civil</label>
      <select id="session-marital" {...register('maritalStatus')}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {saveError && (
        <p role="alert" className="field-error">
          {saveError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        Empezar captura
      </button>
    </form>
  );
}

export function SessionForm() {
  const { db } = useApp();
  const { examineeId = '' } = useParams();
  const [examinee, setExaminee] = useState<Examinee | null | undefined>(undefined);

  useEffect(() => {
    db.examinees
      .get(examineeId)
      .then((found) => {
        setExaminee(found ?? null);
      })
      .catch(() => {
        setExaminee(null);
      });
  }, [db, examineeId]);

  if (examinee === undefined) return <p role="status">Cargando…</p>;
  if (examinee === null) {
    return (
      <section className="panel">
        <p role="alert">No se encontró a este examinado.</p>
        <Link to="/">Volver a examinados</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to={`/examinados/${examinee.id}`}>← {fullName(examinee)}</Link>
      </p>
      <section className="panel" aria-labelledby="session-title">
        <h2 id="session-title">Nueva sesión</h2>
        <Form examinee={examinee} />
      </section>
    </>
  );
}
