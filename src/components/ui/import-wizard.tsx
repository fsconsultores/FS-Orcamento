export interface WizardStepDef {
  key: string
  label: string
}

/** Indicador de etapas para fluxos de importação — cada tela usa só as etapas que
 * realmente tem (2 a 4), sem forçar um número fixo de passos. */
export function WizardSteps({ steps, currentKey }: { steps: WizardStepDef[]; currentKey: string }) {
  const currentIdx = steps.findIndex(s => s.key === currentKey)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const done = i < currentIdx
        const active = s.key === currentKey
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${done || active ? 'bg-primary-400' : 'bg-gray-200'}`} />}
            <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              active ? 'bg-primary-700 text-white' : done ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {i + 1}. {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
