export const encodeSpans = (numbers: ReadonlyArray<number>): string => {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const spans: Array<string> = []
  let from = sorted[0] ?? 0
  let to = from
  for (const n of [...sorted.slice(1), Number.POSITIVE_INFINITY]) {
    if (n === to + 1) {
      to = n
      continue
    }
    spans.push(from === to ? hex4(from) : `${hex4(from)}-${hex4(to)}`)
    from = n
    to = n
  }
  return sorted.length === 0 ? '' : spans.join(' ')
}

export const decodeSpans = (text: string): ReadonlyArray<number> =>
  text === ''
    ? []
    : text.split(' ').flatMap((span) => {
        const [from = 0, to = from] = span.split('-').map((h) => parseInt(h, 16))
        return Array.from({ length: to - from + 1 }, (_, i) => from + i)
      })

const hex4 = (n: number) => n.toString(16).padStart(4, '0')
