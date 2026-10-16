import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { RuleViolated } from '../domain/errors.ts'
import { ReportId } from '../domain/ids.ts'
import { FixNote } from '../domain/upstream.ts'
import { noteFix } from '../server/commands/upstream.ts'
import { myProtonReport } from '../server/queries/upstream.ts'
import { runAction, runRead } from '../server/run.ts'

export const noteFixFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(FixNote))
  .handler(({ data }) => runAction(RuleViolated, noteFix(data)))

export const protonReportFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reportId: ReportId })))
  .handler(({ data }) => runRead(myProtonReport(data.reportId)))
