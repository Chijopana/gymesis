type SkeletonProps = {
  /** Número de líneas o tarjetas fantasma. */
  count?: number
  className?: string
}

/** Bloque genérico con brillo animado. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

/** Sustituye a los "Cargando..." sueltos: mantiene la altura del contenido real. */
export function SkeletonList({ count = 3, className = '' }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Cargando contenido">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="list-row flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
      <span className="sr-only">Cargando...</span>
    </div>
  )
}

export function SkeletonCards({ count = 4, className = '' }: SkeletonProps) {
  return (
    <div className={className} role="status" aria-label="Cargando métricas">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="panel p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
      <span className="sr-only">Cargando...</span>
    </div>
  )
}
