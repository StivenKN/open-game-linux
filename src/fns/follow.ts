import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { FollowChange } from '../domain/follow.ts'
import { changeFollow } from '../server/commands/follow.ts'
import { myFollows } from '../server/queries/follow.ts'
import { runAction, runRead } from '../server/run.ts'

export const myFollowsFn = createServerFn({ method: 'GET' }).handler(() => runRead(myFollows))

export const changeFollowFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(FollowChange))
  .handler(({ data }) => runAction(Schema.Never, changeFollow(data)))
