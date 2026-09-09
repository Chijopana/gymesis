import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Red de seguridad de toda la app.
 *
 * Sin esto, cualquier excepción durante el render (un campo inesperado en una
 * respuesta, por ejemplo) desmonta React y deja una pantalla en blanco sin
 * ninguna pista de lo ocurrido.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no capturado en la interfaz:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <section className="panel max-w-lg w-full p-8 space-y-4 text-center">
          <TriangleAlert size={40} className="mx-auto" style={{ color: 'var(--warning)' }} />
          <h1 className="text-2xl font-bold">Algo se ha roto</h1>
          <p className="section-subtitle">
            La pantalla no ha podido dibujarse. Puedes recargar; si vuelve a pasar, el detalle tecnico esta abajo.
          </p>
          <details className="text-left">
            <summary className="cursor-pointer text-sm soft-text">Detalle tecnico</summary>
            <pre className="panel-sunken mt-2 overflow-auto p-3 text-xs" style={{ maxHeight: '12rem' }}>
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
          <div className="flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              <RotateCcw size={15} />
              Recargar
            </button>
            <button type="button" className="btn-soft" onClick={() => this.setState({ error: null })}>
              Reintentar
            </button>
          </div>
        </section>
      </main>
    )
  }
}
