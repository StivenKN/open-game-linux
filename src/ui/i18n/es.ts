// The Spanish dictionary, the source of every interface string. `Messages` is its shape, and `en.ts` must
// match it key for key and parameter for parameter. Each page area has a file in `es/` and its twin in `en/`.
import { formats } from '../format.ts'
import { vocabulary } from '../vocabulary.ts'
import { catalog } from './es/catalog.tsx'
import { common } from './es/common.ts'
import { sources } from './es/sources.tsx'
import { vocabulary as words } from './es/vocabulary.ts'

export const es = { ...formats('es-CO'), ...vocabulary(words), ...common, catalog, sources }

export type Messages = typeof es
