import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApp } from '../../app/context';
import { CopyButton } from '../../app/CopyButton';
import { listCustomProfiles } from '../../data/repositories';
import type { Examinee, Invitation } from '../../data/schemas';
import { calculateAge, todayIso } from '../../domain/age';
import { type OpenedResponse, importResponse, invitationLink, invitationStatus, openResponse, scoreResponse } from '../../invitations/operator';
import { InvitationError } from '../../invitations/token';
import { ciAgeAllowed, testDateProblem } from '../capture/build';
import { fullName } from '../examinees/names';

const STATUS_LABELS = { pending: 'Pendiente', expired: 'Vencida', imported: 'Importada' };
const TEST_LABELS = { color: 'Colores', ci: 'C.I.', ce: 'C.E.' };

function Review({ opened, onCancel }: { opened: OpenedResponse; onCancel: () => void }) {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const { response, invitation, examinee, problems } = opened;
  const [testDate, setTestDate] = useState(response.testDate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  const confirm = async (): Promise<void> => {
    if (testDateProblem(testDate, examinee.birthDate, today)) {
      setError('Revisa la fecha: no puede ser posterior a hoy ni anterior al nacimiento.');
      return;
    }
    if (invitation.tests.includes('ci') && !ciAgeAllowed(pack, calculateAge(examinee.birthDate, testDate))) {
      setError('No se puede calificar el C.I. con la edad de esta persona en esa fecha.');
      return;
    }
    setBusy(true);
    try {
      const record = scoreResponse(pack, opened, crypto.randomUUID(), testDate, await listCustomProfiles(db));
      await importResponse(db, record, invitation.id);
      void navigate(`/sesiones/${record.session.id}`);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof InvitationError ? caught.message : 'No se pudo calificar. Revisa que el perfil de la invitación siga existiendo. No se guardó nada.');
    }
  };

  return (
    <div className="stack" aria-label="Revisar respuesta" role="group">
      <h3>{fullName(examinee)}</h3>
      <p className="muted">
        {invitation.tests.map((test) => TEST_LABELS[test]).join(' y ')} · consentimiento {response.consentAt.slice(0, 10)} · terminó {response.completedAt.slice(0, 16).replace('T', ' ')} UTC
      </p>
      {response.contentVersion !== pack.contentVersion && (
        <p className="notice">Se contestó con la versión {response.contentVersion} del contenido, y el paquete abierto es la {pack.contentVersion}.</p>
      )}
      {response.completedAt > invitation.expiresAt && <p className="notice">Esta respuesta se terminó después de la fecha límite de la invitación.</p>}
      {problems.map((problem) => (
        <p key={problem} role="alert" className="field-error">
          {problem}
        </p>
      ))}
      <label htmlFor="import-date">Fecha de la prueba</label>
      <input
        id="import-date"
        type="date"
        max={today}
        value={testDate}
        onChange={(event) => {
          setTestDate(event.target.value);
        }}
      />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" disabled={problems.length > 0 || busy} onClick={() => void confirm()}>
          Importar y calificar
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ImportPanel() {
  const { db, pack } = useApp();
  const [code, setCode] = useState('');
  const [opened, setOpened] = useState<OpenedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (text: string): void => {
    setError(null);
    openResponse(db, pack, text)
      .then(setOpened)
      .catch((caught: unknown) => {
        setError(caught instanceof InvitationError ? caught.message : 'No se pudo abrir esta respuesta.');
      });
  };

  return (
    <section className="panel stack" aria-labelledby="import-title">
      <h2 id="import-title">Importar una respuesta</h2>
      {opened ? (
        <Review
          opened={opened}
          onCancel={() => {
            setOpened(null);
          }}
        />
      ) : (
        <>
          <label htmlFor="import-file">Archivo recibido</label>
          <input
            id="import-file"
            type="file"
            accept=".psivrespuesta,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then(open);
            }}
          />
          <label htmlFor="import-code">O pega el código</label>
          <textarea
            id="import-code"
            rows={4}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={code.trim() === ''}
            onClick={() => {
              open(code);
            }}
          >
            Abrir respuesta
          </button>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function InvitationsPage() {
  const { db } = useApp();
  const [rows, setRows] = useState<{ invitation: Invitation; examinee: Examinee | undefined }[] | null>(null);

  useEffect(() => {
    Promise.all([db.invitations.toArray(), db.examinees.toArray()])
      .then(([invitations, examinees]) => {
        const byId = new Map(examinees.map((e) => [e.id, e]));
        setRows(invitations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((invitation) => ({ invitation, examinee: byId.get(invitation.examineeId) })));
      })
      .catch(() => {
        setRows([]);
      });
  }, [db]);

  return (
    <>
      <ImportPanel />
      <section className="panel" aria-labelledby="invitations-title">
        <h2 id="invitations-title">Invitaciones</h2>
        <p className="notice">Las claves que abren las respuestas están solo en este navegador. Haz un respaldo después de crear invitaciones: si se pierden, se pierden las respuestas pendientes.</p>
        {rows?.length === 0 && <p className="muted">Todavía no hay invitaciones. Se crean desde la página de cada examinado.</p>}
        <ul className="examinee-list">
          {rows?.map(({ invitation, examinee }) => {
            const status = invitationStatus(invitation);
            return (
              <li key={invitation.id}>
                <span>
                  <strong>{examinee ? fullName(examinee) : 'Examinado'}</strong>
                  <span className="muted">
                    {' '}
                    · {invitation.tests.map((test) => TEST_LABELS[test]).join(' y ')} · {STATUS_LABELS[status]} · vence {invitation.expiresAt.slice(0, 10)}
                  </span>
                </span>
                {invitation.sessionId ? <Link to={`/sesiones/${invitation.sessionId}`}>Ver informe</Link> : <CopyButton text={invitationLink(invitation.token, window.location)} label="Copiar enlace" />}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
