import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { type SessionRecord, saveSessionRecord } from '../../data/repositories';
import { applyColor, ciAgeAllowed } from './build';
import { CaptureGate, SeriesFields } from './CaptureParts';
import { SAVE_ERROR, instrumentPath, seriesComplete, summaryPath } from './labels';
import { useCaptureRecord } from './useSessionRecord';

function Entry({ record }: { record: SessionRecord }) {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const [serie1, setSerie1] = useState('');
  const [serie2, setSerie2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = record;
  const complete = seriesComplete(serie1, serie2);
  const canGoToCi = !session.instruments.ci && ciAgeAllowed(pack, session.ageAtTest);

  const save = async (next: string): Promise<void> => {
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      await saveSessionRecord(db, applyColor(pack, record, serie1, serie2));
      void navigate(next);
    } catch {
      setError(SAVE_ERROR);
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="color-title">
      <h2 id="color-title">Colores</h2>
      <SeriesFields
        serie1={serie1}
        serie2={serie2}
        onChange={(a, b) => {
          setSerie1(a);
          setSerie2(b);
        }}
      />
      {!complete && <p className="muted">Escribe los ocho números de cada serie para continuar.</p>}
      {!session.instruments.ci && !canGoToCi && <p className="muted">El C.I. no se puede calificar con una edad de {String(session.ageAtTest)} años.</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" disabled={!complete || busy} onClick={() => void save(summaryPath(session.id))}>
          Guardar y terminar
        </button>
        {canGoToCi && (
          <button type="button" className="secondary" disabled={!complete || busy} onClick={() => void save(instrumentPath(session.id, 'ci'))}>
            Guardar y pasar al C.I.
          </button>
        )}
      </div>
    </section>
  );
}

export function ColorEntry() {
  const { sessionId = '' } = useParams();
  const load = useCaptureRecord(sessionId, 'color');
  return load.state === 'ready' ? <Entry key={sessionId} record={load.record} /> : <CaptureGate load={load} sessionId={sessionId} />;
}
