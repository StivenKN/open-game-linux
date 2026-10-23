/** The OpenGame Linux mark: three cards fanned out, the front one with a green status band. */
export function Brand({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="6" width="16" height="22" rx="4" fill="#5b4568" transform="rotate(-10 10 17)" />
      <rect x="9" y="4" width="16" height="22" rx="4" fill="#8a6d99" />
      <rect x="16" y="6" width="16" height="22" rx="4" fill="#fbf1e7" transform="rotate(10 24 17)" />
      <rect x="16" y="22" width="16" height="6" fill="#43d98a" transform="rotate(10 24 17)" />
    </svg>
  )
}
