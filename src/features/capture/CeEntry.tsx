import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { type SessionRecord, saveSessionRecord } from '../../data/repositories';
import { type CeOption, applyCe } from './build';
import { CaptureGate, SeriesFields } from './CaptureParts';
import { SAVE_ERROR, seriesComplete, summaryPath } from './labels';
import { useCaptureRecord } from './useSessionRecord';

const OPTIONS: CeOption[] = ['A', 'B', 'C'];

function Entry({ record }: { record: SessionRecord }) {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const [serie1, setSerie1] = useState('');
  const [serie2, setSerie2] = useState('');
  const [answers, setAnswers] = useState<Record<string, CeOption>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = record;

  const answered = pack.ce.items.filter((item) => answers[item.id]).length;
  const total = pack.ce.items.length;
  const complete = answered === total && seriesComplete(serie1, serie2);

  const save = async (): Promise<void> => {
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      await saveSessionRecord(db, applyCe(pack, record, serie1, serie2, answers));
      void navigate(summaryPath(session.id));
    } catch {
      setError(SAVE_ERROR);
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="ce-title">
      <h2 id="ce-title">C.E.</h2>
      <SeriesFields
        serie1={serie1}
        serie2={serie2}
        onChange={(a, b) => {
          setSerie1(a);
          setSerie2(b);
        }}
      />
      <h3>Test autodescriptivo</h3>
      <div className="ce-grid">
        {pack.ce.items.map((item) => (
          <fieldset key={item.id} className="ce-item">
            <legend>Pregunta {String(item.order)}</legend>
            {OPTIONS.map((option) => (
              <label key={option} className="tick">
                <input
                  type="radio"
                  name={item.id}
                  checked={answers[item.id] === option}
                  onChange={() => {
                    setAnswers((current) => ({ ...current, [item.id]: option }));
                  }}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <p role="status" className="muted">
        {String(answered)} de {String(total)} respuestas capturadas
      </p>
      {!complete && <p className="muted">Faltan datos: completa las dos series y todas las respuestas para guardar.</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button type="button" disabled={!complete || busy} onClick={() => void save()}>
        Guardar y terminar
      </button>
    </section>
  );
}

export function CeEntry() {
  const { sessionId = '' } = useParams();
  const load = useCaptureRecord(sessionId, 'ce');
  return load.state === 'ready' ? <Entry key={sessionId} record={load.record} /> : <CaptureGate load={load} sessionId={sessionId} />;
}
