import { expect, it } from '@effect/vitest'
import { GameId } from '../../domain/ids.ts'
import { embedCodes } from './Embed.tsx'

it('links the badge to the game page, escaping the title for each language', () => {
  const codes = embedCodes('https://opengame.example', { id: GameId.make(7), title: 'Tom & "Jerry" [Remaster] <2>' }, 'es')
  expect(codes.markdown).toBe(
    '[![Estado de Tom & "Jerry" \\[Remaster\\] <2> en OpenGame Linux](https://opengame.example/juegos/7/badge.svg)](https://opengame.example/juegos/7)',
  )
  expect(codes.html).toBe(
    '<a href="https://opengame.example/juegos/7"><img src="https://opengame.example/juegos/7/badge.svg" alt="Estado de Tom &amp; &quot;Jerry&quot; [Remaster] &lt;2> en OpenGame Linux" height="22"></a>',
  )
})

it('asks for an English badge from an English page', () => {
  expect(embedCodes('https://opengame.example', { id: GameId.make(7), title: 'Hades' }, 'en').markdown).toBe(
    '[![State of Hades on OpenGame Linux](https://opengame.example/juegos/7/badge.svg?lang=en)](https://opengame.example/juegos/7)',
  )
})
