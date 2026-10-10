import { createSerializationAdapter } from '@tanstack/react-router'
import { createStart } from '@tanstack/react-start'
import { ReporteNoEncontrado } from '#/server/domain'

// Lets a thrown Schema.TaggedError cross the server-fn wire with its class intact.
const reporteNoEncontrado = createSerializationAdapter({
  key: 'ReporteNoEncontrado',
  test: (v): v is ReporteNoEncontrado => v instanceof ReporteNoEncontrado,
  toSerializable: (e) => ({ id: e.id }),
  fromSerializable: (v) => new ReporteNoEncontrado(v),
})

export const startInstance = createStart(() => ({ serializationAdapters: [reporteNoEncontrado] }))
