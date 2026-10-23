// Open Graph and Twitter card tags, with the absolute URLs link previews need. The root gives every page the
// site's preview; a game page replaces the title, description and image with its own, because HeadContent
// keeps the deepest route's tag for each name.
type Preview = { readonly title: string; readonly description: string; readonly image: string; readonly imageAlt: string }

export const previewMeta = (origin: string, { title, description, image, imageAlt }: Preview) => [
  { property: 'og:title', content: title },
  { property: 'og:description', content: description },
  { property: 'og:image', content: `${origin}${image}` },
  { property: 'og:image:alt', content: imageAlt },
]
