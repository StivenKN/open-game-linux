import { describe, expect, it } from '@effect/vitest'
import { LayerVersionId } from './ids.ts'
import { prefillLayer } from './steam-game.ts'
import type { LayerVersion } from './tables.ts'

const catalog: ReadonlyArray<LayerVersion> = [
  { id: LayerVersionId.make(1), family: 'Proton', variant: 'Valve', version: '9.0-3' },
  { id: LayerVersionId.make(2), family: 'Proton', variant: 'GE', version: '9-4' },
  { id: LayerVersionId.make(3), family: 'Nativo', variant: 'Steam Linux Runtime', version: '3.0' },
]

describe('prefillLayer', () => {
  it.each([
    ['Valve Proton by its version file', 'proton_9', 'proton-9.0-3', { _tag: 'existente', id: 1 }],
    ['GE-Proton by its name alone, any case of the variant', 'GE-Proton9-4', null, { _tag: 'existente', id: 2 }],
    ['a Valve release the catalog lacks', 'proton_9', 'proton-9.0-4', { _tag: 'nueva', family: 'Proton', variant: 'Valve', version: '9.0-4' }],
    ['a GE release the catalog lacks', 'GE-Proton10-4', 'GE-Proton10-4', { _tag: 'nueva', family: 'Proton', variant: 'GE', version: '10-4' }],
    ['Experimental by its version file', 'proton_experimental', 'experimental-9.0-20241017', { _tag: 'nueva', family: 'Proton', variant: 'Experimental', version: '9.0-20241017' }],
  ])('%s', (_, tool, tool_version, expected) => {
    expect(prefillLayer({ tool, tool_version }, catalog)).toEqual(expected)
  })

  it('never guesses the release of a series: proton_9 without its version file leaves the version empty', () => {
    expect(prefillLayer({ tool: 'proton_9', tool_version: null }, catalog)).toEqual({ _tag: 'nueva', family: 'Proton', variant: 'Valve', version: '' })
    expect(prefillLayer({ tool: 'proton_hotfix', tool_version: null }, catalog)).toEqual({ _tag: 'nueva', family: 'Proton', variant: 'Hotfix', version: '' })
  })

  it('reads no tool as a native game, without picking one of the native layers', () => {
    expect(prefillLayer({ tool: null, tool_version: null }, catalog)).toEqual({ _tag: 'nueva', family: 'Nativo', variant: '', version: '' })
  })

  it('leaves a tool it does not know to the user', () => {
    expect(prefillLayer({ tool: 'luxtorpeda', tool_version: null }, catalog)).toBeNull()
  })
})
