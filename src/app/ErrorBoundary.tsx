import { Component, type ReactNode } from 'react';

interface State {
  message: string | null;
}

/** Without this, an error while drawing leaves a blank page and nothing to report. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? `${error.name}: ${error.message}` : 'Error desconocido' };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <main className="app">
        <section className="panel stack">
          <h2>No se pudo mostrar esta pantalla</h2>
          <p role="alert">Tus datos no se perdieron. Si vuelve a ocurrir, comunica este detalle:</p>
          <code>{this.state.message}</code>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Recargar
          </button>
        </section>
      </main>
    );
  }
}
