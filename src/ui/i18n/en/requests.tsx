import { count } from '../../format.ts'
import type { requests as source } from '../es/requests.tsx'

export const requests = {
  title: 'Game requests',
  lede: (myContributions) => (
    <>
      Is a game missing from the catalog? Request it. If someone already requested it, you join their request. A reviewer adds it with
      its details, and in {myContributions('My contributions')} you see when it's ready.
    </>
  ),
  signIn: (signIn) => <>{signIn('Sign in')} to request a game or join a request.</>,
  open: 'Open requests',
  none: 'There are no open requests.',
  form: {
    heading: 'Request a game',
    title: 'Title',
    steam: 'Steam link or App ID (optional)',
    steamHelp: 'With it, nobody requests the same game twice, and the reviewer fills in the game page from the store.',
    submit: 'Request it',
  },
  inCatalog: (title) => `“${title}” is already in the catalog.`,
  viewGame: 'See its page',
  requested: (title) => `You requested “${title}”. When a reviewer adds it, you'll see it in “My contributions”.`,
  joined: (title, n) => `You joined the request for “${title}”. ${n} people are asking for it now.`,
  viewOnSteam: 'See it on Steam',
  requesters: (n) => count(n, 'person asks for it', 'people ask for it'),
  since: (date) => `since ${date}`,
  join: 'Join',
  withdraw: 'Withdraw my request',
  rejectReason: 'Reason (to reject)',
  createGame: 'Create the game',
  reject: 'Reject',
} satisfies typeof source
