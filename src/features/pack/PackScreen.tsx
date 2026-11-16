import { type FormEvent, useState } from 'react';
import { PackError } from '../../content/crypto';
import { openOperatorPack } from '../../content/loader';
import type { OperatorPack } from '../../content/schemas';

const DEMO_FILE = './demo/demo-core.psivpack';
const DEMO_PASSPHRASE = 'demo';

export interface LoadedPack {
  pack: OperatorPack;
  isDemo: boolean;
}

function messageFor(error: unknown): string {
  return error instanceof PackError ? error.message : 'No se pudo abrir el paquete. Inténtalo de nuevo.';
}

export function PackScreen({ onLoaded }: { onLoaded: (loaded: LoadedPack) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (read: () => Promise<ArrayBuffer>, secret: string, isDemo: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const pack = await openOperatorPack(new Uint8Array(await read()), secret);
      setPassphrase('');
      onLoaded({ pack, isDemo });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (file) void open(() => file.arrayBuffer(), passphrase, false);
  };

  const openDemo = (): void => {
    void open(
      async () => {
        const response = await fetch(DEMO_FILE);
        if (!response.ok) throw new Error('demo pack not found');
        return response.arrayBuffer();
      },
      DEMO_PASSPHRASE,
      true,
    );
  };

  return (
    <main className="pack-screen">
      <h1>PsIV</h1>
      <p>Abre tu paquete de contenido para empezar. El archivo y la frase de acceso no salen de este dispositivo.</p>

      <form onSubmit={submit} className="pack-form">
        <label htmlFor="pack-file">Paquete de contenido</label>
        <input
          id="pack-file"
          type="file"
          accept=".psivpack"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />

        <label htmlFor="pack-passphrase">Frase de acceso</label>
        <input
          id="pack-passphrase"
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => {
            setPassphrase(event.target.value);
          }}
        />

        {error && (
          <p role="alert" className="pack-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !file || passphrase === ''}>
          {busy ? 'Abriendo…' : 'Abrir paquete'}
        </button>
      </form>

      <button type="button" className="pack-demo" disabled={busy} onClick={openDemo}>
        Probar con contenido de demostración
      </button>
    </main>
  );
}
