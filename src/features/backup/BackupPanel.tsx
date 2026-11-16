import { type FormEvent, useState } from 'react';
import { PackError } from '../../content/crypto';
import { BACKUP_EXTENSION, MIN_BACKUP_PASSPHRASE, type OpenedBackup, applyBackup, createBackup, databaseCounts, openBackup } from '../../data/backup';
import type { PsivDb } from '../../data/db';
import { todayIso } from '../../domain/age';

function saveFile(bytes: Uint8Array<ArrayBuffer>, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function CreateBackup({ db }: { db: PsivDb }) {
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      setMessage({ error: true, text: `La frase de acceso necesita al menos ${String(MIN_BACKUP_PASSPHRASE)} caracteres.` });
      return;
    }
    if (passphrase !== repeat) {
      setMessage({ error: true, text: 'Las frases de acceso no coinciden.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      saveFile(await createBackup(db, passphrase), `psiv-respaldo-${todayIso()}.${BACKUP_EXTENSION}`);
      setPassphrase('');
      setRepeat('');
      setMessage({ error: false, text: 'Respaldo creado y comprobado. Guárdalo en un lugar seguro.' });
    } catch {
      setMessage({ error: true, text: 'No se pudo crear el respaldo. Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="stack" aria-label="Crear respaldo">
      <h3>Crear respaldo</h3>
      <p className="muted">Si pierdes esta frase de acceso, el respaldo no se podrá recuperar.</p>
      <label htmlFor="backup-passphrase">Frase de acceso del respaldo</label>
      <input
        id="backup-passphrase"
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onChange={(event) => {
          setPassphrase(event.target.value);
        }}
      />
      <label htmlFor="backup-repeat">Repite la frase de acceso</label>
      <input
        id="backup-repeat"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(event) => {
          setRepeat(event.target.value);
        }}
      />
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'field-error' : 'muted'}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Creando…' : 'Crear respaldo'}
      </button>
    </form>
  );
}

function RestoreBackup({ db, onRestored }: { db: PsivDb; onRestored: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [existing, setExisting] = useState(0);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const review = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await openBackup(new Uint8Array(await file.arrayBuffer()), passphrase);
      const counts = await databaseCounts(db);
      setExisting(Object.values(counts).reduce((a, b) => a + b, 0));
      setOpened(result);
    } catch (error) {
      setMessage({ error: true, text: error instanceof PackError ? error.message : 'No se pudo abrir el respaldo.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (): Promise<void> => {
    if (!opened) return;
    setBusy(true);
    try {
      await applyBackup(db, opened.backup);
      setOpened(null);
      setPassphrase('');
      setMessage({ error: false, text: 'Respaldo restaurado.' });
      onRestored();
    } catch {
      setMessage({ error: true, text: 'No se pudo restaurar. Tus datos no cambiaron.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h3>Restaurar respaldo</h3>
      <form onSubmit={(event) => void review(event)} className="stack" aria-label="Restaurar respaldo">
        <label htmlFor="restore-file">Archivo de respaldo</label>
        <input
          id="restore-file"
          type="file"
          accept={`.${BACKUP_EXTENSION}`}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setOpened(null);
          }}
        />
        <label htmlFor="restore-passphrase">Frase de acceso</label>
        <input
          id="restore-passphrase"
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
          }}
        />
        <button type="submit" className="secondary" disabled={busy || !file || passphrase === ''}>
          Revisar respaldo
        </button>
      </form>

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'field-error' : 'muted'}>
          {message.text}
        </p>
      )}

      {opened && (
        <div role="alertdialog" aria-labelledby="restore-title" className="confirm">
          <p id="restore-title">
            <strong>
              Este respaldo tiene {String(opened.counts.examinees)} {opened.counts.examinees === 1 ? 'examinado' : 'examinados'} y{' '}
              {String(opened.counts.sessions)} {opened.counts.sessions === 1 ? 'sesión' : 'sesiones'}.
            </strong>
          </p>
          {existing > 0 ? (
            <p>Restaurarlo reemplazará todos los datos de este navegador. Esto no se puede deshacer.</p>
          ) : (
            <p>Este navegador no tiene datos, así que no se perderá nada.</p>
          )}
          <div className="row">
            <button type="button" className={existing > 0 ? 'danger' : ''} disabled={busy} onClick={() => void restore()}>
              {existing > 0 ? 'Reemplazar mis datos' : 'Restaurar'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOpened(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BackupPanel({ db, onRestored }: { db: PsivDb; onRestored: () => void }) {
  return (
    <section aria-labelledby="backup-title" className="panel">
      <h2 id="backup-title">Respaldos</h2>
      <p className="muted">Los resultados solo existen en este navegador hasta que crees un respaldo.</p>
      <CreateBackup db={db} />
      <RestoreBackup db={db} onRestored={onRestored} />
    </section>
  );
}
