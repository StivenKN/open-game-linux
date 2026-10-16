import { describe, expect, it } from '@effect/vitest'
import { type Decision, type EstadoRevision, planificar } from './review.ts'

const aprobar: Decision = { _tag: 'Aprobar', motivo: 'Probado', evidencia: 'Reporte #12' }
const rechazar: Decision = { _tag: 'Rechazar', motivo: 'Sin evidencia' }
const retirar: Decision = { _tag: 'Retirar', motivo: 'Obsoleto' }

describe('planificar', () => {
  const casos: ReadonlyArray<readonly [EstadoRevision, Decision, ReturnType<typeof planificar>]> = [
    ['pendiente', aprobar, 'aplicar'],
    ['pendiente', rechazar, 'aplicar'],
    ['pendiente', retirar, 'transicion_invalida'],
    ['aprobado', aprobar, 'sin_cambios'],
    ['aprobado', rechazar, 'transicion_invalida'],
    ['aprobado', retirar, 'aplicar'],
    ['rechazado', aprobar, 'transicion_invalida'],
    ['rechazado', rechazar, 'sin_cambios'],
    ['rechazado', retirar, 'transicion_invalida'],
    ['retirado', aprobar, 'transicion_invalida'],
    ['retirado', rechazar, 'transicion_invalida'],
    ['retirado', retirar, 'sin_cambios'],
  ]
  it.each(casos)('%s + %o -> %s', (actual, decision, esperado) => {
    expect(planificar(actual, decision)).toBe(esperado)
  })

  it('is idempotent: applying a decision, then the same one again, changes nothing the second time', () => {
    expect(planificar('pendiente', aprobar)).toBe('aplicar')
    expect(planificar('aprobado', aprobar)).toBe('sin_cambios')
  })
})
