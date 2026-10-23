import { describe, expect, it } from '@effect/vitest'
import { LayerVersionId } from './ids.ts'
import { prefillLayer } from './steam-game.ts'
import type { LayerVersion } from './tables.ts'

const catalog: ReadonlyArray<LayerVersion> = [
  { id: LayerVersionId.make(1), family: 'Proton', variant: 'Valve', version: '9.0-3' },
  { id: LayerVersionId.make(2), family: 'Proton', variant: 'GE', version: '9-4' },
  { id: LayerVersionId.make(3), family: 'Nativo', variant: 'Steam Linux Runtime', version: '3.0' },
]

const run = (tool: string | null, tool_version: string | null, native = false) => prefillLayer({ tool, tool_version, native }, catalog)

describe('prefillLayer', () => {
  it.each([
    ['Valve Proton by its version file', 'proton_9', 'proton-9.0-3', { _tag: 'existente', id: 1 }],
    ['GE-Proton by its name alone, any case of the variant', 'GE-Proton9-4', null, { _tag: 'existente', id: 2 }],
    ['a Valve release the catalog lacks', 'Proton 9.0 (Beta)', 'proton-9.0-4', { _tag: 'nueva', family: 'Proton', variant: 'Valve', version: '9.0-4' }],
    ['a GE release the catalog lacks', 'GE-Proton10-4', 'GE-Proton10-4', { _tag: 'nueva', family: 'Proton', variant: 'GE', version: '10-4' }],
    ['Experimental by its version file', 'Proton - Experimental', 'experimental-9.0-20241017', { _tag: 'nueva', family: 'Proton', variant: 'Experimental', version: '9.0-20241017' }],
  ])('%s', (_, tool, tool_version, expected) => {
    expect(run(tool, tool_version)).toEqual(expected)
  })

  it('never guesses the release of a series: proton_9 without its version file leaves the version empty', () => {
    expect(run('proton_9', null)).toEqual({ _tag: 'nueva', family: 'Proton', variant: 'Valve', version: '' })
    expect(run('proton_hotfix', null)).toEqual({ _tag: 'nueva', family: 'Proton', variant: 'Hotfix', version: '' })
  })

  it('reads a native game as Nativo, without picking one of the native layers', () => {
    expect(run(null, null, true)).toEqual({ _tag: 'nueva', family: 'Nativo', variant: '', version: '' })
  })

  it.each([
    ['a tool it does not know', 'luxtorpeda', null],
    ['another build whose name starts like a release', 'proton-cachyos', 'proton-cachyos-9.0-20241010'],
    ['no tool when the detector could not tell', null, null],
  ])('leaves the layer to the user for %s', (_, tool, tool_version) => {
    expect(run(tool, tool_version)).toBeNull()
  })
})
