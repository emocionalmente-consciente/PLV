import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { PackError } from '../../content/crypto';
import { openManualsPack } from '../../content/loader';
import type { ManualsPack } from '../../content/schemas';
import { ReportHtml } from '../results/ResultParts';
import { manualTitle } from './titles';

const DEMO_FILE = './demo/demo-manuals.psivpack';
const DEMO_PASSPHRASE = 'demo';

const GROUPS = [
  { module: 'p4', title: 'Psicolaboral 4' },
  { module: 'ce', title: 'PsicoEmocional' },
] as const;

function OpenManuals() {
  const { isDemo, setManuals } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (read: () => Promise<ArrayBuffer>, secret: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setManuals(await openManualsPack(new Uint8Array(await read()), secret));
      setPassphrase('');
    } catch (caught) {
      setError(caught instanceof PackError ? caught.message : 'No se pudieron abrir los manuales. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (file) void open(() => file.arrayBuffer(), passphrase);
  };

  return (
    <section className="panel" aria-labelledby="manuals-open-title">
      <h2 id="manuals-open-title">Manuales</h2>
      <p className="muted">Los manuales están en un archivo aparte, que solo se abre cuando lo necesitas.</p>
      {isDemo ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void open(async () => {
              const response = await fetch(DEMO_FILE);
              if (!response.ok) throw new Error('demo manuals not found');
              return response.arrayBuffer();
            }, DEMO_PASSPHRASE);
          }}
        >
          Abrir manuales de demostración
        </button>
      ) : (
        <form onSubmit={submit} className="stack" aria-label="Abrir manuales">
          <label htmlFor="manuals-file">Archivo de manuales</label>
          <input
            id="manuals-file"
            type="file"
            accept=".psivpack"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
          <label htmlFor="manuals-passphrase">Frase de acceso</label>
          <input
            id="manuals-passphrase"
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value);
            }}
          />
          <button type="submit" disabled={busy || !file || passphrase === ''}>
            {busy ? 'Abriendo…' : 'Abrir manuales'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}

const manualPath = (id: string): string => `/manuales/${encodeURIComponent(id)}`;

function ManualsList({ manuals }: { manuals: ManualsPack }) {
  const { pack } = useApp();
  return (
    <section className="panel" aria-labelledby="manuals-title">
      <h2 id="manuals-title">Manuales</h2>
      {manuals.contentVersion !== pack.contentVersion && (
        <p role="status" className="notice">
          Estos manuales son de la versión {manuals.contentVersion} del contenido, y el paquete abierto es la {pack.contentVersion}.
        </p>
      )}
      {GROUPS.map(({ module, title }) => {
        const list = manuals.manuals.filter((m) => m.module === module);
        return list.length === 0 ? null : (
          <div key={module}>
            <h3>{title}</h3>
            <ul className="examinee-list">
              {list.map((manual) => (
                <li key={manual.id}>
                  <Link to={manualPath(manual.id)}>{manualTitle(manual.code, manual.title)}</Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export function ManualsPage() {
  const { manuals } = useApp();
  return manuals ? <ManualsList manuals={manuals} /> : <OpenManuals />;
}

export function ManualView() {
  const { manuals } = useApp();
  const { manualId = '' } = useParams();
  if (!manuals) return <OpenManuals />;
  const manual = manuals.manuals.find((m) => m.id === manualId);
  if (!manual) {
    return (
      <section className="panel">
        <p role="alert">No se encontró este manual.</p>
        <Link to="/manuales">Volver a manuales</Link>
      </section>
    );
  }
  return (
    <>
      <div className="result-nav no-print row">
        <Link to="/manuales">← Manuales</Link>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Imprimir
        </button>
      </div>
      <article className="sheet manual">
        <h2 className="sheet-title">{manualTitle(manual.code, manual.title)}</h2>
        <div className="report-text">
          <ReportHtml html={manual.html} assets={manuals.assets} />
        </div>
      </article>
    </>
  );
}
