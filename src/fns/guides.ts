import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GuideEdit, NewGuide } from '../domain/contributions.ts'
import { GuideId } from '../domain/ids.ts'
import { createGuide, editGuide } from '../server/commands/contributions.ts'
import { guideEditOptions, guideOptions } from '../server/queries/form-options.ts'
import { guide, guides } from '../server/queries/guides.ts'
import { runAction, runRead } from '../server/run.ts'

export const guidesFn = createServerFn({ method: 'GET' }).handler(() => runRead(guides))

export const guideFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guideId: GuideId })))
  .handler(({ data }) => runRead(guide(data.guideId)))

export const guideOptionsFn = createServerFn({ method: 'GET' }).handler(() => runRead(guideOptions))

// A guide breaks no domain rule: what can go wrong is the role (notFound) or a missing guide.
export const createGuideFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewGuide))
  .handler(({ data }) => runAction(Schema.Never, createGuide(data)))

export const guideEditOptionsFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guideId: GuideId })))
  .handler(({ data }) => runRead(guideEditOptions(data.guideId)))

export const editGuideFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(GuideEdit))
  .handler(({ data }) => runAction(Schema.Never, editGuide(data)))
