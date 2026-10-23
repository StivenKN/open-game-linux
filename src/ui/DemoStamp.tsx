import { useT } from './i18n/messages.ts'

export function DemoStamp() {
  const { demo } = useT()
  return (
    <span className="stamp" title={demo.title}>
      {demo.label}
    </span>
  )
}
