import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { deleteSessionCascade, listSessions, updateExaminee } from '../../data/repositories';
import type { Examinee, Session } from '../../data/schemas';
import { calculateAge, todayIso } from '../../domain/age';
import { INSTRUMENT_LABELS, instrumentPath } from '../capture/labels';
import { pendingInstruments } from '../capture/build';
import { ExamineeForm } from './ExamineeForm';
import { fullName } from './names';

function capturedLabel(session: Session): string {
  const { color, ci, ce } = session.instruments;
  const parts = [color && INSTRUMENT_LABELS.color, ci && INSTRUMENT_LABELS.ci, ce && INSTRUMENT_LABELS.ce].filter(Boolean);
  return parts.length > 0 ? parts.join(' y ') : 'Sin capturar';
}

export function ExamineeDetail() {
  const { db } = useApp();
  const { examineeId = '' } = useParams();
  const [examinee, setExaminee] = useState<Examinee | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [changes, setChanges] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([db.examinees.get(examineeId), listSessions(db, examineeId)])
      .then(([found, list]) => {
        if (!current) return;
        setExaminee(found ?? null);
        setSessions(list);
      })
      .catch(() => {
        if (current) setError('No se pudo leer la base de datos de este navegador.');
      });
    return () => {
      current = false;
    };
  }, [db, examineeId, changes]);

  const reload = (): void => {
    setChanges((n) => n + 1);
  };

  if (examinee === undefined) return <p role="status">Cargando…</p>;
  if (examinee === null) {
    return (
      <section className="panel">
        <p role="alert">No se encontró a este examinado.</p>
        <Link to="/">Volver a examinados</Link>
      </section>
    );
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    try {
      await deleteSessionCascade(db, pendingDelete.id);
      setPendingDelete(null);
      reload();
    } catch {
      setError('No se pudo eliminar. No se cambió ningún dato.');
    }
  };

  return (
    <>
      <p>
        <Link to="/">← Examinados</Link>
      </p>
      <section className="panel" aria-labelledby="examinee-title">
        <h2 id="examinee-title">{fullName(examinee)}</h2>
        <p className="muted">
          {examinee.sex === 'F' ? 'Femenino' : 'Masculino'} · {examinee.birthDate} · {String(calculateAge(examinee.birthDate, todayIso()))} años
        </p>
        <div className="row">
          <Link className="button" to={`/examinados/${examinee.id}/sesion/nueva`}>
            Nueva sesión
          </Link>
          <Link className="button secondary" to={`/examinados/${examinee.id}/invitacion`}>
            Invitar por enlace
          </Link>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditing((value) => !value);
            }}
          >
            {editing ? 'Cancelar edición' : 'Editar datos'}
          </button>
        </div>
        {editing && (
          <ExamineeForm
            initial={{
              givenName: examinee.givenName,
              paternalSurname: examinee.paternalSurname,
              maternalSurname: examinee.maternalSurname,
              sex: examinee.sex,
              birthDate: examinee.birthDate,
            }}
            label="Editar examinado"
            submitLabel="Guardar cambios"
            onSave={async (input) => {
              await updateExaminee(db, examinee.id, input);
              setEditing(false);
              reload();
            }}
          />
        )}
      </section>

      <section className="panel" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Sesiones</h2>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {sessions.length === 0 && <p className="muted">Todavía no hay sesiones.</p>}
        <ul className="examinee-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <span>
                <Link to={`/sesiones/${session.id}`}>
                  <strong>{session.testDate}</strong>
                </Link>
                <span className="muted">
                  {' '}
                  · {capturedLabel(session)} · {session.profile.name}
                </span>
                {pendingInstruments(session).length > 0 && (
                  <span className="pending">
                    {pendingInstruments(session).map((instrument) => (
                      <Link key={instrument} to={instrumentPath(session.id, instrument)}>
                        Capturar {INSTRUMENT_LABELS[instrument]}
                      </Link>
                    ))}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="secondary"
                aria-label={`Eliminar la sesión del ${session.testDate}`}
                onClick={() => {
                  setPendingDelete(session);
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>

        {pendingDelete && (
          <div role="alertdialog" aria-labelledby="delete-session-title" className="confirm">
            <p id="delete-session-title">
              <strong>¿Eliminar la sesión del {pendingDelete.testDate}?</strong>
            </p>
            <p>Se eliminarán sus resultados. Esto no se puede deshacer, salvo restaurando un respaldo.</p>
            <div className="row">
              <button type="button" className="danger" onClick={() => void confirmDelete()}>
                Sí, eliminar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPendingDelete(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
