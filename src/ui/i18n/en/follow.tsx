import { count } from '../../format.ts'
import type { follow as source } from '../es/follow.tsx'

export const follow = {
  signIn: 'Sign in to follow it',
  follow: 'Follow',
  unfollow: 'Unfollow',
  news: {
    label: 'News',
    since: (date) => `News since ${date}`,
    approved: (n) => `${count(n, 'new approved report', 'new approved reports')}.`,
    status: (from, to) => (
      <>
        The state went from {from} to {to}
      </>
    ),
    markSeen: 'Mark as seen',
  },
  page: {
    title: 'Followed games',
    intro: 'The games you follow and what changed since you last marked each one as seen. Only approved reports count.',
    empty: "You don't follow any game yet. Open its page from the catalog and press “Follow”.",
    noNews: (date) => `No news since ${date}.`,
  },
} satisfies typeof source
