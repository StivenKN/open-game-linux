// What a Schema check says when a value fails it. The domain carries a code, never text: each interface
// language words the code in its dictionary (`checks` in `ui/i18n`), so a form's field errors follow the
// page's language with one Schema per concept.
import { Schema } from 'effect'

export const CheckMessage = Schema.Literals([
  'required',
  'fpsRange',
  'failureNeeded',
  'apiNeeded',
  'stepNeeded',
  'vulkanMinimumNeedsVulkan',
  'vulkanVersionNeedsSupport',
  'steamStoreRef',
  'protonfixesPr',
  'email',
  'passwordNeeded',
])
export type CheckMessage = typeof CheckMessage.Type

/** The annotation a check takes: `Schema.isNonEmpty(says('required'))`. */
export const says = (message: CheckMessage) => ({ message })
