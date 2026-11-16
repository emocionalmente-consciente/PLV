import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CopyButton } from '../../app/CopyButton';
import type { ExamineePack } from '../../content/schemas';
import { COLOR_NAMES } from '../../domain/norms/norms';
import { CARD_COLORS } from './colors';
import { PAUSE_QUESTIONS } from './pause-questions';
import { type CeChoice, type Progress, answerCi, answerPause, pauseQuestionsAnswered, pauseRemaining, waitRemaining, withQuestionWait } from './progress';

/** Moves focus to each new step, so keyboard and screen reader users aren't left behind. */
export function StepHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1}>
      {children}
    </h2>
  );
}

export function ConsentStep({ text, onAccept }: { text: string; onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <section className="panel stack">
      <StepHeading>Antes de empezar</StepHeading>
      <p>{text}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => {
            setAgreed(event.target.checked);
          }}
        />
        He leído lo anterior y acepto participar.
      </label>
      <button type="button" disabled={!agreed} onClick={onAccept}>
        Continuar
      </button>
    </section>
  );
}

export function InstructionsStep({ title, lines, onContinue }: { title: string; lines: readonly string[]; onContinue: () => void }) {
  return (
    <section className="panel stack">
      <StepHeading>{title}</StepHeading>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" onClick={onContinue}>
        Continuar
      </button>
    </section>
  );
}

export function ColorStep({ layout, picked, serie, onPick }: { layout: string; picked: string; serie: 1 | 2; onPick: (digit: string) => void }) {
  return (
    <section className="panel stack">
      <StepHeading>{serie === 1 ? 'Primera elección' : 'Segunda elección'}</StepHeading>
      <p>Señale el color que más le atrae a la vista en este momento.</p>
      <div className="card-table">
        {[...layout].map((digit) =>
          picked.includes(digit) ? (
            <span key={digit} className="card-slot" />
          ) : (
            <button
              key={digit}
              type="button"
              className="color-card"
              data-color={digit}
              aria-label={COLOR_NAMES[digit]}
              style={{ backgroundColor: CARD_COLORS[digit] }}
              onClick={() => {
                onPick(digit);
              }}
            />
          ),
        )}
      </div>
    </section>
  );
}

export function PauseStep({ progress, seconds, onChange, onContinue }: { progress: Progress; seconds: number; onChange: (next: Progress) => void; onContinue: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const remaining = pauseRemaining(progress, now, seconds);
  return (
    <section className="panel stack">
      <StepHeading>Pausa</StepHeading>
      <p>Antes de elegir de nuevo, piense en otra cosa y conteste estas preguntas. Sus respuestas no se envían ni se califican.</p>
      {progress.pauseQuestions.map((question, position) => (
        <div key={question} className="stack">
          <label htmlFor={`pause-${String(position)}`}>{PAUSE_QUESTIONS[question]}</label>
          <input
            id={`pause-${String(position)}`}
            autoComplete="off"
            maxLength={200}
            value={progress.pauseAnswers[position] ?? ''}
            onChange={(event) => {
              onChange(answerPause(progress, position, event.target.value));
            }}
          />
        </div>
      ))}
      <p role="timer" className="muted">
        {remaining > 0 ? `Podrá continuar en ${String(Math.floor(remaining / 60))}:${String(remaining % 60).padStart(2, '0')}` : 'Ya puede continuar.'}
      </p>
      <button type="button" disabled={remaining > 0 && !pauseQuestionsAnswered(progress)} onClick={onContinue}>
        {remaining > 0 ? 'Saltar espera' : 'Continuar'}
      </button>
    </section>
  );
}

function Navigation({ onBack, onNext, nextLabel, nextDisabled = false }: { onBack: (() => void) | null; onNext: () => void; nextLabel: string; nextDisabled?: boolean }) {
  return (
    <div className="row">
      {onBack && (
        <button type="button" className="secondary" onClick={onBack}>
          Anterior
        </button>
      )}
      <button type="button" disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  );
}

export function QuestionWait({ until, onDone }: { until: string; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (waitRemaining(until, current) === 0) onDone();
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [until, onDone]);
  return (
    <section className="panel stack">
      <StepHeading>Espere un momento</StepHeading>
      <p role="timer">La siguiente pregunta aparecerá en {String(waitRemaining(until, now))} s.</p>
      <button type="button" className="secondary" onClick={onDone}>
        Continuar ahora
      </button>
    </section>
  );
}

interface QuestionStepProps {
  pack: ExamineePack;
  progress: Progress;
  delaySeconds: number;
  onChange: (next: Progress) => void;
  onFinish: () => void;
}

export function CiStep({ pack, progress, delaySeconds, onChange, onFinish }: QuestionStepProps) {
  const [confirming, setConfirming] = useState(false);
  const { items } = pack.ci;
  const item = items[progress.ciIndex];
  if (!item) return null;
  const position = progress.ciIndex + 1;
  const value = progress.ci[item.id] ?? '';
  const isLast = position === items.length;
  const unanswered = items.filter((i) => !(i.id in progress.ci)).length;
  const go = (index: number): void => {
    setConfirming(false);
    const moved = { ...progress, ciIndex: index };
    // Only moving forward waits, so the examinee can go back to review an answer freely.
    onChange(index > progress.ciIndex ? withQuestionWait(moved, delaySeconds, new Date()) : moved);
  };
  const set = (answer: string): void => {
    onChange(answerCi(progress, item.id, answer));
  };
  const image = pack.assets[item.imageAsset];
  return (
    <section className="panel stack">
      <StepHeading key={item.id}>
        Pregunta {String(position)} de {String(items.length)}
      </StepHeading>
      {image && <img className="ci-image" src={`data:image/png;base64,${image}`} alt={`Imagen de la pregunta ${String(position)}`} />}
      {item.answer.kind === 'number' ? (
        <>
          <label htmlFor="ci-number">Número que sigue</label>
          <input
            id="ci-number"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={value}
            onChange={(event) => {
              set(event.target.value.replace(/\D/g, ''));
            }}
          />
        </>
      ) : (
        <fieldset className="answer-options">
          <legend>Respuesta</legend>
          {item.answer.options.map((option) => (
            <label key={option} className="check">
              <input
                type="radio"
                name={item.id}
                checked={value === option}
                onChange={() => {
                  set(option);
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>
      )}
      {confirming && (
        <p role="alert">
          {unanswered === 1 ? 'Falta 1 pregunta por contestar.' : `Faltan ${String(unanswered)} preguntas por contestar.`} Las que deje en blanco contarán como no contestadas.
        </p>
      )}
      <Navigation
        onBack={position > 1 ? () => { go(progress.ciIndex - 1); } : null}
        nextLabel={isLast ? (confirming ? 'Terminar de todos modos' : 'Terminar esta prueba') : 'Siguiente'}
        onNext={() => {
          if (!isLast) go(progress.ciIndex + 1);
          else if (unanswered > 0 && !confirming) setConfirming(true);
          else onFinish();
        }}
      />
    </section>
  );
}

export function CeStep({ pack, progress, delaySeconds, onChange, onFinish }: QuestionStepProps) {
  const { items } = pack.ce;
  const item = items[progress.ceIndex];
  if (!item) return null;
  const position = progress.ceIndex + 1;
  const isLast = position === items.length;
  return (
    <section className="panel stack">
      <StepHeading key={item.id}>
        Pregunta {String(position)} de {String(items.length)}
      </StepHeading>
      <fieldset className="answer-options">
        <legend>{item.stem}</legend>
        {item.options.map((option) => (
          <label key={option.key} className="check">
            <input
              type="radio"
              name={item.id}
              checked={progress.ce[item.id] === option.key}
              onChange={() => {
                onChange({ ...progress, ce: { ...progress.ce, [item.id]: option.key as CeChoice } });
              }}
            />
            {option.text}
          </label>
        ))}
      </fieldset>
      <Navigation
        onBack={position > 1 ? () => { onChange({ ...progress, ceIndex: progress.ceIndex - 1 }); } : null}
        nextLabel={isLast ? 'Terminar esta prueba' : 'Siguiente'}
        nextDisabled={!progress.ce[item.id]}
        onNext={() => {
          if (isLast) onFinish();
          else onChange(withQuestionWait({ ...progress, ceIndex: progress.ceIndex + 1 }, delaySeconds, new Date()));
        }}
      />
    </section>
  );
}

export function FinishStep({ onFinish, failed }: { onFinish: () => void; failed: boolean }) {
  return (
    <section className="panel stack">
      <StepHeading>Ha terminado las pruebas</StepHeading>
      <p>Al generar el código, sus respuestas se cifran y ya no se pueden cambiar.</p>
      {failed && (
        <p role="alert" className="field-error">
          No se pudo generar el código. Inténtelo de nuevo.
        </p>
      )}
      <button type="button" onClick={onFinish}>
        Generar mi código
      </button>
    </section>
  );
}

export function DoneStep({ code, onErase }: { code: string; onErase: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'respuestas.psivrespuesta';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="panel stack">
      <StepHeading>Envíe sus respuestas</StepHeading>
      <p>Falta un paso: esta página no envía nada por sí sola. Mande el archivo o el código a la persona que le envió el enlace. Está cifrado, y solo ella puede leerlo.</p>
      <div className="row">
        <button type="button" onClick={download}>
          Descargar archivo
        </button>
        <CopyButton text={code} label="Copiar código" />
      </div>
      <label htmlFor="response-code">Código</label>
      <textarea id="response-code" readOnly rows={6} value={code} />
      {confirming ? (
        <div role="alertdialog" aria-labelledby="erase-title" className="confirm">
          <p id="erase-title">
            <strong>¿Ya envió sus respuestas?</strong> Si las borra antes de enviarlas, tendría que contestar de nuevo.
          </p>
          <div className="row">
            <button type="button" className="danger" onClick={onErase}>
              Sí, borrar de este equipo
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Borrar de este equipo
        </button>
      )}
    </section>
  );
}
