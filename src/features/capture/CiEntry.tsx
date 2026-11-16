import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { type SessionRecord, saveSessionRecord } from '../../data/repositories';
import { type CiTotals, applyCi, ciAgeAllowed, ciTotals } from './build';
import { CaptureGate } from './CaptureParts';
import { SAVE_ERROR, instrumentPath, summaryPath } from './labels';
import { useCaptureRecord } from './useSessionRecord';

const FACTORS = [
  { key: 'verbal', label: 'Verbal' },
  { key: 'numeric', label: 'Numérico' },
  { key: 'spatial', label: 'Espacial' },
] as const;

const itemNumber = (itemId: string): string => itemId.replace('ci:', '');

/** Columns start with the lowest question number, as the legacy grid does, so entry follows the sheet. */
const orderOf = (itemIds: readonly string[]): number => Math.min(...itemIds.map((id) => Number(itemNumber(id))));

function Entry({ record }: { record: SessionRecord }) {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<Partial<Record<keyof CiTotals, string>>>({});
  const [confirmZero, setConfirmZero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = record;
  const totals = ciTotals(pack, checked);

  const itemsOf = (factor: keyof CiTotals): string[] => pack.ci.items.filter((item) => pack.ci.key.find((k) => k.itemId === item.id)?.factor === factor).map((item) => item.id);

  const columns = [...FACTORS].sort((a, b) => orderOf(itemsOf(a.key)) - orderOf(itemsOf(b.key)));

  const toggle = (itemId: string): void => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /** Legacy `CalculaChecados`: a typed total ticks that many from the top. A bad value is ignored. */
  const applyTotal = (factor: keyof CiTotals): void => {
    const draft = drafts[factor];
    setDrafts((current) => ({ ...current, [factor]: undefined }));
    if (draft === undefined || !/^\d+$/.test(draft)) return;
    const items = itemsOf(factor);
    const value = Number(draft);
    if (value > items.length || value === totals[factor]) return;
    setChecked((current) => {
      const next = new Set(current);
      for (const id of items) next.delete(id);
      for (const id of items.slice(0, value)) next.add(id);
      return next;
    });
  };

  const save = async (next: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await saveSessionRecord(db, applyCi(pack, record, checked));
      void navigate(next);
    } catch {
      setError(SAVE_ERROR);
      setBusy(false);
    }
  };

  /** As in legacy, all three totals at zero need a confirmation. */
  const requestSave = (next: string): void => {
    if (checked.size === 0) setConfirmZero(next);
    else void save(next);
  };

  return (
    <section className="panel" aria-labelledby="ci-title">
      <h2 id="ci-title">C.I.</h2>
      <p className="muted">Marca las respuestas correctas de la hoja. También puedes escribir el total de un factor.</p>
      <div className="ci-grid">
        {columns.map(({ key, label }) => (
          <fieldset key={key}>
            <legend>{label}</legend>
            <label htmlFor={`total-${key}`}>Total {label}</label>
            <input
              id={`total-${key}`}
              className="total"
              inputMode="numeric"
              autoComplete="off"
              value={drafts[key] ?? String(totals[key])}
              onChange={(event) => {
                setDrafts((current) => ({ ...current, [key]: event.target.value }));
              }}
              onBlur={() => {
                applyTotal(key);
              }}
            />
            <div className="ticks">
              {itemsOf(key).map((itemId) => (
                <label key={itemId} className="tick">
                  <input
                    type="checkbox"
                    checked={checked.has(itemId)}
                    onChange={() => {
                      toggle(itemId);
                    }}
                  />
                  {itemNumber(itemId)}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {confirmZero && (
        <div role="alertdialog" aria-labelledby="zero-title" className="confirm">
          <p id="zero-title">
            <strong>Los totales de los 3 factores suman cero.</strong>
          </p>
          <p>¿Quieres guardar el C.I. con todos los factores en cero?</p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void save(confirmZero)}>
              Sí, guardar
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setConfirmZero(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            requestSave(summaryPath(session.id));
          }}
        >
          Guardar y terminar
        </button>
        {!session.instruments.color && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              requestSave(instrumentPath(session.id, 'color'));
            }}
          >
            Guardar y pasar a Colores
          </button>
        )}
      </div>
    </section>
  );
}

export function CiEntry() {
  const { pack } = useApp();
  const { sessionId = '' } = useParams();
  const load = useCaptureRecord(sessionId, 'ci');
  if (load.state !== 'ready') return <CaptureGate load={load} sessionId={sessionId} />;
  const { session } = load.record;
  if (!ciAgeAllowed(pack, session.ageAtTest)) {
    return (
      <section className="panel">
        <p role="alert">No se puede calificar el C.I. con una edad de {String(session.ageAtTest)} años.</p>
        <Link to={summaryPath(session.id)}>Volver a la sesión</Link>
      </section>
    );
  }
  return <Entry key={sessionId} record={load.record} />;
}
