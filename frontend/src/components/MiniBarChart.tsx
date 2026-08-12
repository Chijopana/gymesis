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
}

export default function MiniBarChart({ title, subtitle, items, valueSuffix = '', emptyLabel = 'Sin datos' }: MiniBarChartProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 0)

  return (
    <section className="panel p-5 stack-gap">
      <div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-sm soft-text mt-1">{subtitle}</p>}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">{emptyLabel}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const width = maxValue > 0 ? Math.max(6, (item.value / maxValue) * 100) : 0
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</span>
                  <span className="soft-text">{item.value.toFixed(1)}{valueSuffix}{item.hint ? ` · ${item.hint}` : ''}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden border border-slate-400/20 dark:border-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-500"
                    style={{ width: `${width}%` }}
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
