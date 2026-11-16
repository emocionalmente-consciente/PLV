import { useEffect, useState } from 'react';
import type { ExamineePack } from '../../content/schemas';
import { todayIso } from '../../domain/age';
import { sealResponse } from '../../invitations/response';
import type { InvitationClaims } from '../../invitations/token';
import { type View, createExamineeDb, loadInvitation, openPackFile } from './load';
import { COLOR_PAUSE_SECONDS, type Progress, buildResponse, currentStage, endPause, pickColor, sealedProgress } from './progress';
import { CeStep, CiStep, ColorStep, ConsentStep, DoneStep, FinishStep, InstructionsStep, PauseStep, QuestionWait, StepHeading } from './Steps';

const db = createExamineeDb();

const TITLES = { general: 'Indicaciones', color: 'Prueba de colores', ci: 'Prueba de razonamiento', ce: 'Cuestionario' };

function Message({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel stack">
      <StepHeading>{title}</StepHeading>
      <p role="alert">{text}</p>
    </section>
  );
}

function Erased() {
  return <Message title="Listo" text="Sus respuestas se borraron de este equipo. Ya puede cerrar esta página." />;
}

function Done({ progress }: { progress: Progress }) {
  const [erased, setErased] = useState(false);
  if (erased) return <Erased />;
  return (
    <DoneStep
      code={progress.sealed ?? ''}
      onErase={() => {
        void db.transaction('rw', db.progress, db.packs, async () => {
          await db.progress.delete(progress.id);
          await db.packs.delete(progress.id);
        }).then(() => {
          setErased(true);
        });
      }}
    />
  );
}

function Session({ claims, pack, initial }: { claims: InvitationClaims; pack: ExamineePack; initial: Progress }) {
  const [progress, setProgress] = useState(initial);
  const [saveFailed, setSaveFailed] = useState(false);
  const [sealFailed, setSealFailed] = useState(false);

  const save = (next: Progress): void => {
    setProgress(next);
    db.progress.put(next).catch(() => {
      setSaveFailed(true);
    });
  };

  const seal = async (): Promise<void> => {
    try {
      const now = new Date();
      const code = await sealResponse(buildResponse(progress, claims, pack.contentVersion, now, todayIso(now)), claims.encryptionKey);
      save(sealedProgress(progress, code));
      await db.packs.delete(claims.id);
    } catch {
      setSealFailed(true);
    }
  };

  const colorPauseSeconds = claims.colorPauseSeconds ?? COLOR_PAUSE_SECONDS;
  const stage = currentStage(progress, claims.tests, colorPauseSeconds);
  const delaySeconds = claims.questionDelaySeconds ?? 0;
  const body = (() => {
    if ((stage.kind === 'ci' || stage.kind === 'ce') && progress.waitUntil !== null) {
      return (
        <QuestionWait
          until={progress.waitUntil}
          onDone={() => {
            save({ ...progress, waitUntil: null });
          }}
        />
      );
    }
    switch (stage.kind) {
      case 'consent':
        return (
          <ConsentStep
            text={pack.consent}
            onAccept={() => {
              save({ ...progress, consentAt: new Date().toISOString() });
            }}
          />
        );
      case 'instructions':
        return (
          <InstructionsStep
            key={stage.page}
            title={TITLES[stage.page]}
            lines={pack.instructions[stage.page]}
            onContinue={() => {
              save({ ...progress, seen: [...progress.seen, stage.page] });
            }}
          />
        );
      case 'color':
        return (
          <ColorStep
            key={stage.serie}
            serie={stage.serie}
            layout={stage.serie === 1 ? progress.layout1 : progress.layout2}
            picked={stage.serie === 1 ? progress.serie1 : progress.serie2}
            onPick={(digit) => {
              save(pickColor(progress, stage.serie, digit, new Date()));
            }}
          />
        );
      case 'pause':
        return (
          <PauseStep
            progress={progress}
            seconds={colorPauseSeconds}
            onChange={save}
            onContinue={() => {
              save(endPause(progress));
            }}
          />
        );
      case 'ci':
        return (
          <CiStep
            delaySeconds={delaySeconds}
            pack={pack}
            progress={progress}
            onChange={save}
            onFinish={() => {
              save({ ...progress, ciFinished: true });
            }}
          />
        );
      case 'ce':
        return (
          <CeStep
            delaySeconds={delaySeconds}
            pack={pack}
            progress={progress}
            onChange={save}
            onFinish={() => {
              save({ ...progress, ceFinished: true });
            }}
          />
        );
      case 'finish':
        return <FinishStep failed={sealFailed} onFinish={() => void seal()} />;
      case 'done':
        return <Done progress={progress} />;
    }
  })();

  return (
    <>
      {saveFailed && (
        <p role="alert" className="field-error">
          Este navegador no pudo guardar su avance. No cierre esta página hasta terminar.
        </p>
      )}
      {body}
    </>
  );
}

function PackPicker({ claims, error, onView }: { claims: InvitationClaims; error: string | null; onView: (view: View) => void }) {
  return (
    <section className="panel stack">
      <StepHeading>Abra su prueba</StepHeading>
      <p>Seleccione el archivo que le enviaron junto con este enlace.</p>
      <label htmlFor="pack-file">Archivo de la prueba</label>
      <input
        id="pack-file"
        type="file"
        accept=".psivpack"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void file
            .arrayBuffer()
            .then((buffer) => openPackFile(db, claims, new Uint8Array(buffer)))
            .then(onView)
            .catch(() => {
              onView({ kind: 'need-file', claims, error: 'No se pudo abrir este archivo.' });
            });
        }}
      />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function ExamineeApp({ token }: { token: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    let current = true;
    loadInvitation(db, token, document.baseURI)
      .then((next) => {
        if (current) setView(next);
      })
      .catch(() => {
        if (current) setView({ kind: 'failed' });
      });
    return () => {
      current = false;
    };
  }, [token]);

  return (
    <main className="app examinee">
      {view.kind === 'loading' && <p role="status">Cargando…</p>}
      {view.kind === 'invalid' && <Message title="Enlace no válido" text="Este enlace no es válido o está incompleto. Pida a quien se lo envió que se lo mande de nuevo." />}
      {view.kind === 'expired' && <Message title="Enlace vencido" text="Este enlace ya venció. Pida a quien se lo envió que le mande uno nuevo." />}
      {view.kind === 'failed' && <Message title="No se pudo abrir" text="Este navegador no pudo abrir la prueba. Inténtelo en otro navegador, fuera del modo privado." />}
      {view.kind === 'need-file' && <PackPicker claims={view.claims} error={view.error} onView={setView} />}
      {view.kind === 'ready' && <Session claims={view.claims} pack={view.pack} initial={view.progress} />}
      {view.kind === 'sealed' && <Done progress={view.progress} />}
    </main>
  );
}
