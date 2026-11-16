import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { CopyButton } from '../../app/CopyButton';
import { listCustomProfiles } from '../../data/repositories';
import type { CustomProfile, Examinee, Invitation } from '../../data/schemas';
import { calculateAge, todayIso } from '../../domain/age';
import { DEFAULT_NORM_PROFILE } from '../../domain/version';
import { createInvitation, invitationLink } from '../../invitations/operator';
import { DEFAULT_COLOR_PAUSE_SECONDS, type InvitedTest, MAX_COLOR_PAUSE_SECONDS, MAX_QUESTION_DELAY_SECONDS, isAllowedPackUrl } from '../../invitations/token';
import { ciAgeAllowed, maritalOptions } from '../capture/build';
import { fullName } from '../examinees/names';

const DEMO_PACK_PATH = 'demo/demo-examinee.psivpack';
const PAUSE_MESSAGE = `Escribe un número entero de segundos, de 0 a ${String(MAX_COLOR_PAUSE_SECONDS)}.`;
const DELAY_MESSAGE = `Escribe un número entero de segundos, de 0 a ${String(MAX_QUESTION_DELAY_SECONDS)}.`;

const TEST_CHOICES: { value: string; label: string; tests: InvitedTest[] }[] = [
  { value: 'color,ci', label: 'Colores y C.I.', tests: ['color', 'ci'] },
  { value: 'color', label: 'Solo colores', tests: ['color'] },
  { value: 'ci', label: 'Solo C.I.', tests: ['ci'] },
  { value: 'ce', label: 'C.E. (incluye colores)', tests: ['ce'] },
];

interface Fields {
  tests: string;
  profileId: string;
  normProfileId: string;
  maritalStatus: string;
  expiresInDays: number;
  questionDelaySeconds: number;
  colorPauseSeconds: number;
  packUrl: string;
}

function Created({ invitation, sendFile }: { invitation: Invitation; sendFile: boolean }) {
  const link = invitationLink(invitation.token, window.location);
  return (
    <div className="stack">
      <p role="status">
        <strong>Invitación creada.</strong> Vence el {invitation.expiresAt.slice(0, 10)}.
      </p>
      <label htmlFor="invitation-link">Enlace para enviar</label>
      <textarea id="invitation-link" readOnly rows={5} value={link} />
      <div className="row">
        <CopyButton text={link} label="Copiar enlace" />
      </div>
      {sendFile && <p className="notice">Envía también el archivo examinee.psivpack: la persona lo seleccionará al abrir el enlace.</p>}
      <p className="muted">Quien tenga este enlace puede ver las preguntas. La persona te devolverá un archivo o un código, que se importa en Invitaciones.</p>
      <Link to="/invitaciones">Ir a invitaciones</Link>
    </div>
  );
}

function Form({ examinee }: { examinee: Examinee }) {
  const { db, pack, isDemo } = useApp();
  const options = maritalOptions(examinee.sex);
  const { register, handleSubmit, setError, formState } = useForm<Fields>({
    defaultValues: { tests: 'color,ci', profileId: pack.profiles[0]?.id ?? '', normProfileId: DEFAULT_NORM_PROFILE, maritalStatus: options[0] ?? '', expiresInDays: 14, questionDelaySeconds: 0, colorPauseSeconds: DEFAULT_COLOR_PAUSE_SECONDS, packUrl: '' },
  });
  const { errors, isSubmitting } = formState;
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);
  const [created, setCreated] = useState<{ invitation: Invitation; sendFile: boolean } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    listCustomProfiles(db)
      .then(setCustomProfiles)
      .catch(() => {
        setSaveError('No se pudieron leer los perfiles propios.');
      });
  }, [db]);

  const submit = async (fields: Fields): Promise<void> => {
    const choice = TEST_CHOICES.find((c) => c.value === fields.tests);
    if (!choice) return;
    const packUrl = isDemo ? DEMO_PACK_PATH : fields.packUrl.trim();
    if (packUrl !== '' && !isAllowedPackUrl(packUrl)) {
      setError('packUrl', { message: 'Escribe una dirección que empiece con https://, o déjala vacía.' });
      return;
    }
    if (choice.tests.includes('ci') && !ciAgeAllowed(pack, calculateAge(examinee.birthDate, todayIso()))) {
      setError('tests', { message: 'No se puede calificar el C.I. con la edad de esta persona.' });
      return;
    }
    try {
      const invitation = await createInvitation(db, pack, {
        examineeId: examinee.id,
        tests: choice.tests,
        profileId: fields.profileId,
        normProfileId: fields.normProfileId,
        maritalStatus: fields.maritalStatus,
        expiresInDays: fields.expiresInDays,
        packUrl: packUrl === '' ? null : packUrl,
        questionDelaySeconds: fields.questionDelaySeconds,
        colorPauseSeconds: fields.colorPauseSeconds,
      });
      setCreated({ invitation, sendFile: packUrl === '' });
    } catch {
      setSaveError('No se pudo crear la invitación. Inténtalo de nuevo.');
    }
  };

  if (created) return <Created invitation={created.invitation} sendFile={created.sendFile} />;

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="stack" aria-label="Nueva invitación">
      <label htmlFor="invite-tests">Pruebas</label>
      <select id="invite-tests" {...register('tests')}>
        {TEST_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {errors.tests?.message && (
        <p role="alert" className="field-error">
          {errors.tests.message}
        </p>
      )}

      <label htmlFor="invite-profile">Perfil del puesto</label>
      <select id="invite-profile" {...register('profileId')}>
        {[...pack.profiles, ...customProfiles].map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>

      <label htmlFor="invite-norm">Referencia</label>
      <select id="invite-norm" {...register('normProfileId')}>
        {pack.normProfiles.map((norm) => (
          <option key={norm.id} value={norm.id}>
            {norm.name}
          </option>
        ))}
      </select>

      <label htmlFor="invite-marital">Estado civil</label>
      <select id="invite-marital" {...register('maritalStatus')}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label htmlFor="invite-days">Días para contestar</label>
      <input id="invite-days" type="number" min={1} max={90} {...register('expiresInDays', { valueAsNumber: true, min: { value: 1, message: 'Entre 1 y 90 días.' }, max: { value: 90, message: 'Entre 1 y 90 días.' }, required: 'Entre 1 y 90 días.' })} />
      {errors.expiresInDays?.message && (
        <p role="alert" className="field-error">
          {errors.expiresInDays.message}
        </p>
      )}

      <label htmlFor="invite-delay">Segundos entre preguntas</label>
      <input id="invite-delay" type="number" min={0} max={MAX_QUESTION_DELAY_SECONDS} step={1} {...register('questionDelaySeconds', { valueAsNumber: true, required: DELAY_MESSAGE, min: { value: 0, message: DELAY_MESSAGE }, max: { value: MAX_QUESTION_DELAY_SECONDS, message: DELAY_MESSAGE }, validate: (value) => Number.isInteger(value) || DELAY_MESSAGE })} />
      <p className="muted">Espera antes de mostrar cada pregunta de C.I. y C.E. Con 0 no hay espera.</p>
      {errors.questionDelaySeconds?.message && (
        <p role="alert" className="field-error">
          {errors.questionDelaySeconds.message}
        </p>
      )}

      <label htmlFor="invite-pause">Segundos de pausa entre colores</label>
      <input id="invite-pause" type="number" min={0} max={MAX_COLOR_PAUSE_SECONDS} step={1} {...register('colorPauseSeconds', { valueAsNumber: true, required: PAUSE_MESSAGE, min: { value: 0, message: PAUSE_MESSAGE }, max: { value: MAX_COLOR_PAUSE_SECONDS, message: PAUSE_MESSAGE }, validate: (value) => Number.isInteger(value) || PAUSE_MESSAGE })} />
      <p className="muted">El libro pide unos minutos. Durante la pausa se muestran 3 preguntas, y al contestarlas la persona puede saltar la espera. Con 0 no hay pausa.</p>
      {errors.colorPauseSeconds?.message && (
        <p role="alert" className="field-error">
          {errors.colorPauseSeconds.message}
        </p>
      )}

      {!isDemo && (
        <>
          <label htmlFor="invite-url">Dirección del archivo examinee.psivpack (opcional)</label>
          <input id="invite-url" type="url" placeholder="https://" {...register('packUrl')} />
          <p className="muted">Si la dejas vacía, tendrás que enviar el archivo junto con el enlace.</p>
          {errors.packUrl?.message && (
            <p role="alert" className="field-error">
              {errors.packUrl.message}
            </p>
          )}
        </>
      )}

      {saveError && (
        <p role="alert" className="field-error">
          {saveError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        Crear enlace
      </button>
    </form>
  );
}

export function InvitationForm() {
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
      <section className="panel" aria-labelledby="invite-title">
        <h2 id="invite-title">Invitar por enlace</h2>
        <Form examinee={examinee} />
      </section>
    </>
  );
}
