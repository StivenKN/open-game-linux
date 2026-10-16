import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GuideId } from '../domain/ids.ts'
import { guide, guides } from '../server/queries/guides.ts'
import { runRead } from '../server/run.ts'

export const guidesFn = createServerFn({ method: 'GET' }).handler(() => runRead(guides))

export const guideFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guideId: GuideId })))
  .handler(({ data }) => runRead(guide(data.guideId)))
