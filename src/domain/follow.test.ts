import { describe, expect, it } from '@effect/vitest'
import type { ApprovedTest } from './compatibility.ts'
import { newsSince } from './follow.ts'
import { ReportId } from './ids.ts'
import type { Outcome } from './literals.ts'
import { gtaV } from './samples.ts'

const [base] = gtaV.tests
const approvedOn = (report_id: number, outcome: Outcome, reviewed_at: string): ApprovedTest =>
  ({ ...base, report_id: ReportId.make(report_id), outcome, tested_at: new Date(reviewed_at), reviewed_at: new Date(reviewed_at), failures: [] })

const seenAt = new Date('2026-10-10T00:00:00Z')
const now = new Date('2026-10-15T00:00:00Z')

describe('newsSince', () => {
  it('nothing approved after the follower looked is no news', () => {
    expect(newsSince([approvedOn(1, 'funciona', '2026-10-01T12:00:00Z')], seenAt, now)).toEqual({ approved: 0, previous_status: null })
  })

  it('an approval after seen_at counts, and the state it changed is the one computed at seen_at', () => {
    const tests = [approvedOn(1, 'funciona', '2026-10-01T12:00:00Z'), approvedOn(2, 'no_inicia', '2026-10-12T12:00:00Z')]
    expect(newsSince(tests, seenAt, now)).toEqual({ approved: 1, previous_status: 'funciona' })
  })

  it('an approval that leaves the state as it was is news without a state change', () => {
    const tests = [approvedOn(1, 'funciona', '2026-10-01T12:00:00Z'), approvedOn(2, 'funciona', '2026-10-12T12:00:00Z')]
    expect(newsSince(tests, seenAt, now)).toEqual({ approved: 1, previous_status: null })
  })

  it('an approval at the exact instant the follower looked was seen', () => {
    expect(newsSince([approvedOn(1, 'funciona', seenAt.toISOString())], seenAt, now)).toEqual({ approved: 0, previous_status: null })
  })

  it('with no new approval the state still changes when the year window moves past the evidence', () => {
    const tests = [approvedOn(1, 'no_inicia', '2025-11-01T12:00:00Z'), approvedOn(2, 'funciona', '2026-10-01T12:00:00Z')]
    expect(newsSince(tests, seenAt, new Date('2026-11-15T00:00:00Z'))).toEqual({ approved: 0, previous_status: 'resultados_variables' })
  })
})
