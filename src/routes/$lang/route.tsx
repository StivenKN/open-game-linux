// Every page lives under /es or /en. The segment is the page's language (`useT()` reads it); any other
// first segment names no page. Unprefixed paths never reach here: the start middleware redirects them.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { isLang, type Lang, localizedPath, withoutLang } from '../../ui/i18n/lang.ts'
import { messages } from '../../ui/i18n/messages.ts'

export const Route = createFileRoute('/$lang')({
  params: {
    parse: ({ lang }): { lang: Lang } => {
      if (!isLang(lang)) throw notFound()
      return { lang }
    },
    stringify: ({ lang }) => ({ lang }),
  },
  // The page in each language, for search engines; the unprefixed path is x-default because it redirects
  // by the visitor's language. An index route matches with a trailing slash, which withoutLang drops.
  head: ({ params, match, matches }) => {
    const path = withoutLang(matches.at(-1)?.pathname ?? '/')
    const url = (lang: Lang) => `${match.context.origin}${localizedPath(lang, path)}`
    return {
      meta: [{ name: 'description', content: messages[params.lang].description }],
      links: [
        { rel: 'canonical', href: url(params.lang) },
        { rel: 'alternate', hrefLang: 'es', href: url('es') },
        { rel: 'alternate', hrefLang: 'en', href: url('en') },
        { rel: 'alternate', hrefLang: 'x-default', href: `${match.context.origin}${path}` },
      ],
    }
  },
})
