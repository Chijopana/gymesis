import { useId, useState } from 'react'
import { Table2 } from 'lucide-react'

type BarItem = {
  label: string
  value: number
  hint?: string
}

type MiniBarChartProps = {
  title: string
  subtitle?: string
  items: BarItem[]
  valueSuffix?: string
  emptyLabel?: string
  /** Decimales de los valores; el volumen en kg no necesita más de uno. */
  precision?: number
}

const formatter = (value: number, precision: number) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: precision, maximumFractionDigits: precision })

/**
 * Barras horizontales para magnitud por categoría.
 *
 * Una sola serie, así que un solo tono (azul secuencial de la marca) en lugar de
 * un color por barra: el color no codifica nada aquí, la longitud sí. Cada barra
 * lleva su valor escrito al lado, y hay una vista de tabla para quien no pueda
 * comparar longitudes a ojo.
 */
export default function MiniBarChart({
  title,
  subtitle,
  items,
  valueSuffix = '',
  emptyLabel = 'Sin datos todavía',
  precision = 1,
}: MiniBarChartProps) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0)
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{title}</h3>
          {subtitle && <p className="section-subtitle mt-0.5">{subtitle}</p>}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className={`btn-soft btn-xs shrink-0 ${showTable ? 'is-active' : ''}`}
            onClick={() => setShowTable((value) => !value)}
            aria-expanded={showTable}
            aria-controls={tableId}
          >
            <Table2 size={13} />
            {showTable ? 'Gráfica' : 'Tabla'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">{emptyLabel}</div>
      ) : showTable ? (
        <div id={tableId} className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="py-1.5 text-left font-semibold">Categoría</th>
                <th className="py-1.5 text-right font-semibold">Valor{valueSuffix && ` (${valueSuffix.trim()})`}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.label} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="py-1.5">{item.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatter(item.value, precision)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-1.5 font-semibold">Total</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatter(total, precision)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div id={tableId} className="space-y-2.5">
          {items.map((item) => {
            // Un valor > 0 siempre deja una marca visible aunque sea diminuto.
            const width = maxValue > 0 && item.value > 0 ? Math.max(2, (item.value / maxValue) * 100) : 0
            return (
              <div
                key={item.label}
                className="space-y-1"
                title={`${item.label}: ${formatter(item.value, precision)}${valueSuffix}${item.hint ? ` · ${item.hint}` : ''}`}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="soft-text shrink-0 tabular-nums">
                    {formatter(item.value, precision)}
                    {valueSuffix}
                    {item.hint ? ` · ${item.hint}` : ''}
                  </span>
                </div>
                <div
                  className="h-2.5 w-full overflow-hidden rounded-sm"
                  style={{ background: 'var(--panel-sunken)' }}
                  role="img"
                  aria-label={`${item.label}: ${formatter(item.value, precision)}${valueSuffix}`}
                >
                  <div
                    className="h-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${width}%`,
                      // Extremo redondeado en la punta, recto en la línea base.
                      borderRadius: '0 4px 4px 0',
                      background: 'var(--chart-bar)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
