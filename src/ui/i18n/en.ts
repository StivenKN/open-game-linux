// The English dictionary. Spanish is the source: `satisfies Messages` fails the build on a missing or extra key.
import { formats } from '../format.ts'
import { vocabulary } from '../vocabulary.ts'
import { catalog } from './en/catalog.tsx'
import { common } from './en/common.ts'
import { sources } from './en/sources.tsx'
import { vocabulary as words } from './en/vocabulary.ts'
import type { Messages } from './es.ts'

export const en = { ...formats('en-US'), ...vocabulary(words), ...common, catalog, sources } satisfies Messages
