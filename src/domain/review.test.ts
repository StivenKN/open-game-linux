import { describe, expect, it } from '@effect/vitest'
import { type Decision, type ReviewStatus, planTransition } from './review.ts'

const approve: Decision = { _tag: 'Aprobar', motivo: 'Probado', evidencia: 'Reporte #12' }
const reject: Decision = { _tag: 'Rechazar', motivo: 'Sin evidencia' }
const withdraw: Decision = { _tag: 'Retirar', motivo: 'Obsoleto' }

describe('planificar', () => {
  const cases: ReadonlyArray<readonly [ReviewStatus, Decision, ReturnType<typeof planTransition>]> = [
    ['pendiente', approve, 'aplicar'],
    ['pendiente', reject, 'aplicar'],
    ['pendiente', withdraw, 'transicion_invalida'],
    ['aprobado', approve, 'sin_cambios'],
    ['aprobado', reject, 'transicion_invalida'],
    ['aprobado', withdraw, 'aplicar'],
    ['rechazado', approve, 'transicion_invalida'],
    ['rechazado', reject, 'sin_cambios'],
    ['rechazado', withdraw, 'transicion_invalida'],
    ['retirado', approve, 'transicion_invalida'],
    ['retirado', reject, 'transicion_invalida'],
    ['retirado', withdraw, 'sin_cambios'],
  ]
  it.each(cases)('%s + %o -> %s', (current, decision, expected) => {
    expect(planTransition(current, decision)).toBe(expected)
  })

  it('is idempotent: applying a decision, then the same one again, changes nothing the second time', () => {
    expect(planTransition('pendiente', approve)).toBe('aplicar')
    expect(planTransition('aprobado', approve)).toBe('sin_cambios')
  })
})
