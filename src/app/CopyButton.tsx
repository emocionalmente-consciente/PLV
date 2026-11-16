import { useState } from 'react';

/** Some browsers refuse clipboard access, so the text must also be visible to copy by hand. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setStatus('copied');
      })
      .catch(() => {
        setStatus('failed');
      });
  };
  return (
    <>
      <button type="button" onClick={copy}>
        {label}
      </button>
      <span role="status" className="muted">
        {status === 'copied' && 'Copiado.'}
        {status === 'failed' && 'No se pudo copiar. Selecciónelo y cópielo a mano.'}
      </span>
    </>
  );
}
