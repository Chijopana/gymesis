import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}

export default function PageHeader({ title, subtitle, icon, actions, meta }: PageHeaderProps) {
  return (
    <header className="mb-6 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="title-row">
            {icon}
            <h1 className="section-title">{title}</h1>
          </div>
          {subtitle && <p className="section-subtitle max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="kpi-strip">{meta}</div>}
    </header>
  )
}
