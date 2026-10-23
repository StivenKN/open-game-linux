// How components read the interface language. A page's language is its `/$lang` segment, so nothing passes
// `lang` down: any component under a route calls `useT()` for that language's dictionary.
import { useParams } from '@tanstack/react-router'
import { en } from './en.ts'
import { es, type Messages } from './es.ts'
import { isLang, type Lang } from './lang.ts'

/** Every dictionary, for code outside a component: a route's `head` reads `messages[params.lang]`. */
export const messages: Record<Lang, Messages> = { es, en }

/** The language of the page being rendered, or Spanish outside a language prefix (a 404 at the root). */
export const useLang = (): Lang => {
  const { lang } = useParams({ strict: false })
  return isLang(lang) ? lang : 'es'
}

export const useT = (): Messages => messages[useLang()]
