// Every page lives under /es or /en. The segment is the page's language (`useT()` reads it); any other
// first segment names no page. Unprefixed paths never reach here: the start middleware redirects them.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { imageQuery, isLang, type Lang, localizedPath, pagePath } from '../../ui/i18n/lang.ts'
import { messages } from '../../ui/i18n/messages.ts'
import { previewMeta } from '../-meta.ts'

export const Route = createFileRoute('/$lang')({
  params: {
    parse: ({ lang }): { lang: Lang } => {
      if (!isLang(lang)) throw notFound()
      return { lang }
    },
    stringify: ({ lang }) => ({ lang }),
  },
  // The page in each language, for search engines; the unprefixed path is x-default because it redirects
  // by the visitor's language. An index route matches with a trailing slash, which pagePath drops. The
  // site's link preview is the default a game page replaces with its own.
  head: ({ params, match, matches }) => {
    const t = messages[params.lang]
    const path = pagePath(matches.at(-1)?.pathname ?? '/')
    const url = (lang: Lang) => `${match.context.origin}${localizedPath(lang, path)}`
    return {
      meta: [
        { name: 'description', content: t.description },
        { property: 'og:locale', content: params.lang === 'es' ? 'es_ES' : 'en_US' },
        ...previewMeta(match.context.origin, {
          title: 'OpenGame Linux',
          description: t.description,
          image: `/og.png${imageQuery(params.lang)}`,
          imageAlt: t.share.site.imageAlt,
        }),
      ],
      links: [
        { rel: 'canonical', href: url(params.lang) },
        { rel: 'alternate', hrefLang: 'es', href: url('es') },
        { rel: 'alternate', hrefLang: 'en', href: url('en') },
        { rel: 'alternate', hrefLang: 'x-default', href: `${match.context.origin}${path}` },
      ],
    }
  },
})
