import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { requestPersistentStorage, type PsivDb } from '../../data/db';
import { type DeleteImpact, createExaminee, deleteExamineeCascade, examineeDeleteImpact, searchExaminees } from '../../data/repositories';
import type { Examinee } from '../../data/schemas';
import { calculateAge, todayIso } from '../../domain/age';
import { ExamineeForm } from './ExamineeForm';
import { EMPTY_EXAMINEE, fullName } from './names';

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function ExamineesPanel({ db, version }: { db: PsivDb; version: number }) {
  const [query, setQuery] = useState('');
  const [examinees, setExaminees] = useState<Examinee[] | null>(null);
  const [changes, setChanges] = useState(0);
  const [pending, setPending] = useState<{ examinee: Examinee; impact: DeleteImpact } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    searchExaminees(db, query)
      .then((found) => {
        if (current) setExaminees(found);
      })
      .catch(() => {
        if (current) setError('No se pudo leer la base de datos de este navegador.');
      });
    return () => {
      current = false;
    };
  }, [db, query, changes, version]);

  const refresh = useCallback(() => {
    setChanges((n) => n + 1);
  }, []);

  const askDelete = async (examinee: Examinee): Promise<void> => {
    setError(null);
    setPending({ examinee, impact: await examineeDeleteImpact(db, examinee.id) });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pending) return;
    try {
      await deleteExamineeCascade(db, pending.examinee.id);
      setPending(null);
      refresh();
    } catch {
      setError('No se pudo eliminar. No se cambió ningún dato.');
    }
  };

  const today = todayIso();

  return (
    <section aria-labelledby="examinees-title" className="panel">
      <h2 id="examinees-title">Examinados</h2>

      <label htmlFor="examinee-search">Buscar por nombre</label>
      <input
        id="examinee-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}

      {examinees?.length === 0 && <p className="muted">{query.trim() ? 'No hay resultados.' : 'Todavía no hay examinados.'}</p>}

      {examinees && examinees.length > 0 && (
        <ul className="examinee-list">
          {examinees.map((e) => (
            <li key={e.id}>
              <span>
                <Link to={`/examinados/${e.id}`}>
                  <strong>{fullName(e)}</strong>
                </Link>
                <span className="muted"> · {String(calculateAge(e.birthDate, today))} años</span>
              </span>
              <button type="button" className="secondary" aria-label={`Eliminar a ${fullName(e)}`} onClick={() => void askDelete(e)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <div role="alertdialog" aria-labelledby="delete-title" className="confirm">
          <p id="delete-title">
            <strong>¿Eliminar a {fullName(pending.examinee)}?</strong>
          </p>
          <p>
            {pending.impact.sessions === 0
              ? 'No tiene sesiones guardadas.'
              : `También se eliminarán ${plural(pending.impact.sessions, 'sesión', 'sesiones')} y ${plural(pending.impact.scores, 'puntuación', 'puntuaciones')}.`}{' '}
            Esto no se puede deshacer, salvo restaurando un respaldo.
          </p>
          <div className="row">
            <button type="button" className="danger" onClick={() => void confirmDelete()}>
              Sí, eliminar
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setPending(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <details className="add-examinee">
        <summary>Agregar examinado</summary>
        <ExamineeForm
          initial={EMPTY_EXAMINEE}
          label="Nuevo examinado"
          submitLabel="Agregar examinado"
          onSave={async (input) => {
            await createExaminee(db, input);
            void requestPersistentStorage();
            refresh();
          }}
        />
      </details>
    </section>
  );
}
