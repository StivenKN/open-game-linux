import { expect, it } from '@effect/vitest'
import { disenoPortada } from './portada.ts'

// Expected values come from running the seeding code of the approved "C · Biblioteca" design prototype.
it('seeds the same cover as the approved prototype for each title', () => {
  const portada = (titulo: string) => {
    const { matiz, motivo, rotulo } = disenoPortada(titulo)
    return { matiz, motivo, estrecho: rotulo.estrecho, arriba: rotulo.arriba }
  }
  expect(portada('Grand Theft Auto V')).toEqual({ matiz: 218, motivo: 'franjas', estrecho: false, arriba: true })
  expect(portada('Valorant')).toEqual({ matiz: 197, motivo: 'sol', estrecho: false, arriba: true })
  expect(portada('The Witcher 3: Wild Hunt')).toEqual({ matiz: 103, motivo: 'picos', estrecho: true, arriba: true })
  expect(portada('Counter-Strike 2')).toEqual({ matiz: 322, motivo: 'bloques', estrecho: false, arriba: false })
})

it('sizes the cover title by its longest word', () => {
  expect(disenoPortada('Valorant').rotulo.tamano).toBe(12.78)
  expect(disenoPortada('The Witcher 3: Wild Hunt').rotulo.tamano).toBe(23.38)
})
