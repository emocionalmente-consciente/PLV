import { Link, Navigate } from 'react-router';
import { serieProblem } from '../../domain/color/serie';
import { summaryPath } from './labels';
import type { SessionLoad } from './useSessionRecord';

/** Shows the states where capture can't go ahead. Returns null when it can. */
export function CaptureGate({ load, sessionId }: { load: SessionLoad; sessionId: string }) {
  switch (load.state) {
    case 'loading':
      return <p role="status">Cargando…</p>;
    case 'missing':
      return (
        <section className="panel">
          <p role="alert">No se encontró esta sesión.</p>
          <Link to="/">Volver a examinados</Link>
        </section>
      );
    case 'other-content':
      return (
        <section className="panel">
          <p role="alert">Esta sesión se creó con otra versión del contenido. Crea una sesión nueva para capturar con el paquete abierto.</p>
          <Link to="/">Volver a examinados</Link>
        </section>
      );
    case 'already-captured':
      return <Navigate to={summaryPath(sessionId)} replace />;
    case 'ready':
      return null;
  }
}

function serieMessage(text: string): string | null {
  const problem = serieProblem(text);
  if (!problem) return null;
  return problem.kind === 'not-a-digit' ? 'Teclea solamente números del 0 al 7.' : `El número ${problem.digit} ya está en la serie.`;
}

interface SeriesProps {
  serie1: string;
  serie2: string;
  onChange: (serie1: string, serie2: string) => void;
}

function SerieField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const message = serieMessage(value);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="serie"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={value}
        aria-invalid={message !== null}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
    </>
  );
}

export function SeriesFields({ serie1, serie2, onChange }: SeriesProps) {
  return (
    <div className="stack">
      <SerieField
        id="serie-1"
        label="Serie 1"
        value={serie1}
        onChange={(value) => {
          onChange(value, serie2);
        }}
      />
      <SerieField
        id="serie-2"
        label="Serie 2"
        value={serie2}
        onChange={(value) => {
          onChange(serie1, value);
        }}
      />
    </div>
  );
}
