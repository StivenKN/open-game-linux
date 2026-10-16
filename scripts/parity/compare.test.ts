import { describe, expect, test } from 'vitest'
import { eraseIdentifierKeys, parseMarkupMap, unmapMarkup } from './compare.ts'

describe('unmapMarkup', () => {
  test('a class entry maps back class names only', () => {
    const head = '<a class="tarjeta state" href="/?state=funciona"><input name="state" value="state" data-tono="state">'
    expect(unmapMarkup(head, parseMarkupMap({ classes: { estado: 'state' } }))).toBe('<a class="tarjeta estado" href="/?state=funciona"><input name="state" value="state" data-tono="state">')
  })

  test('a form field entry maps back the name of form controls only', () => {
    const head = '<form action="/?state=1"><select name="state"><option value="state"></select><a name="state" href="#state"></a></form>'
    expect(unmapMarkup(head, parseMarkupMap({ formFields: { estado: 'state' } }))).toBe('<form action="/?state=1"><select name="estado"><option value="state"></select><a name="state" href="#state"></a></form>')
  })

  test('data-* names, id references and custom properties map back, their values and text do not', () => {
    const head = '<label for="list" aria-label="list"><span id="list" aria-labelledby="title list" data-tone="tone" style="flex-grow:1;--tone:var(--tone-red)">tone</span></label>'
    const sections = { ids: { lista: 'list' }, dataAttributes: { 'data-tono': 'data-tone' }, customProperties: { '--tono': '--tone', '--tono-rojo': '--tone-red' } }
    expect(unmapMarkup(head, parseMarkupMap(sections))).toBe(
      '<label for="lista" aria-label="list"><span id="lista" aria-labelledby="title lista" data-tono="tone" style="flex-grow:1;--tono:var(--tono-rojo)">tone</span></label>',
    )
  })

  test('the flat map shape is rejected', () => {
    expect(() => parseMarkupMap({ estado: 'state' })).toThrow('markup-map.json: unknown sections estado')
  })
})

describe('eraseIdentifierKeys', () => {
  const literals = new Set(['funciona'])
  const values = (script: string) => eraseIdentifierKeys(`<script>${script}</script>`, literals).values

  test('identifier keys are erased', () => {
    expect(values('{ejemplo:{a:1}}')).toBe(values('{sample:{b:1}}'))
  })

  test('numeric keys, route ids and stored values are kept', () => {
    expect(values('{1:"a",2:"b"}')).toBe('{1:"a",2:"b"}')
    expect(values('{por_estado:{sin_evidencia:3,funciona:1}}')).toBe('{:{:3,funciona:1}}')
    expect(values('{"/juegos/$juegoId":1}')).toBe(values('{"/juegos/$gameId":1}'))
    expect(values('{"/juegos/$juegoId":1}')).not.toBe(values('{"/games/$gameId":1}'))
  })
})
