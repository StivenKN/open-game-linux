// The Spanish dictionary, the source of every interface string. `Messages` is its shape, and `en.ts` must
// match it key for key and parameter for parameter. Each page area has a file in `es/` and its twin in `en/`.
import { formats } from '../format.ts'
import { vocabulary } from '../vocabulary.ts'
import { common } from './es/common.ts'
import { account } from './es/account.tsx'
import { catalog } from './es/catalog.tsx'
import { compatibility } from './es/compatibility.tsx'
import { diagnosis } from './es/diagnosis.tsx'
import { follow } from './es/follow.tsx'
import { game } from './es/game.tsx'
import { guides } from './es/guides.tsx'
import { profile } from './es/profile.tsx'
import { report } from './es/report.tsx'
import { requests } from './es/requests.tsx'
import { review } from './es/review.tsx'
import { share } from './es/share.ts'
import { sources } from './es/sources.tsx'
import { vocabulary as words } from './es/vocabulary.ts'

export const es = { ...formats('es-CO'), ...vocabulary(words), ...common, catalog, game, share, compatibility, follow, report, profile, diagnosis, account, review, requests, guides, sources }

export type Messages = typeof es
