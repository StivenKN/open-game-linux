import type { Messages } from '../ui/i18n/es.ts'
import type { Lang } from '../ui/i18n/lang.ts'
import { messages } from '../ui/i18n/messages.ts'

/** A page's `head` title in its language: `head: ({ params }) => titled(params.lang, (t) => t.catalog.title)`. */
export const titled = (lang: Lang, page: (t: Messages) => string) => ({ meta: [{ title: messages[lang].title(page(messages[lang])) }] })
