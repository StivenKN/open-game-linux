import type { ReactNode } from 'react'
import type { ContributionType } from '../../../domain/review.ts'
import { count } from '../../format.ts'

const tabs = { reporte: 'Reportes', perfil: 'Perfiles', solucion: 'Soluciones' } satisfies Record<ContributionType, string>

/** The reviewer's pages: the queue at /revision and the new game form at /catalogo/nuevo. */
export const review = {
  queue: {
    heading: 'Revisión de aportes',
    lede: 'Aprobar exige evidencia verificable. Lo pendiente no cuenta en ningún resumen; lo aprobado se puede retirar si deja de ser válido.',
    tabsLabel: 'Tipo de aporte',
    tabs,
    pending: (n: number) => count(n, 'pendiente', 'pendientes'),
    empty: (type: ContributionType) => `No hay ${tabs[type].toLowerCase()} pendientes ni aprobados.`,
    byOn: (author: string, date: string) => `por ${author} · ${date}`,
    blockers: 'Por qué no se puede aprobar todavía',
    own: 'Es tu aporte: otro revisor debe decidir sobre él.',
    reason: 'Motivo',
    evidence: 'Evidencia (para aprobar)',
    evidencePlaceholder: 'Referencia verificable: captura, registro o reporte identificado',
    approve: 'Aprobar',
    reject: 'Rechazar',
    withdraw: 'Retirar',
    version: (version: string) => `versión ${version}`,
    testedOn: (date: string) => `probado el ${date}`,
    noProfile: 'Sin perfil.',
    followedProfile: (profile: string) => `Siguió el perfil «${profile}».`,
    steps: (n: number) => count(n, 'paso', 'pasos'),
    workingReports: (n: number) => count(n, 'reporte funcional aprobado', 'reportes funcionales aprobados'),
    answers: (failure: ReactNode, detail: string, report: number, status: string) => (
      <>
        Responde a {failure} «{detail}» del reporte #{report} ({status}).
      </>
    ),
    recommendsNoProfile: 'No recomienda un perfil.',
    recommends: (profile: string) => `Recomienda el perfil «${profile}».`,
  },

  newGame: {
    caption: 'Catálogo',
    fromRequest: (title: string) => `Creas el juego que se pidió como «${title}». Al crearlo, el pedido queda cumplido y enlaza a su ficha.`,
    requestClosed: 'Ese pedido ya no está abierto, así que el juego que crees no quedará enlazado a él.',
    steam: {
      heading: 'Rellenar desde Steam',
      intro: 'Trae el título, la descripción y la edición de Steam desde la tienda. Todo sigue editable, y las APIs gráficas y la CPU mínima las marcas tú.',
      field: 'Enlace o App ID de Steam',
      submit: 'Rellenar desde Steam',
      submitting: 'Consultando a Steam…',
      filled: (title: string) => `Rellenado con los datos de Steam de «${title}». Revisa cada campo antes de crear el juego.`,
    },
    title: 'Título',
    description: 'Descripción',
    editions: 'Ediciones',
    editionsHelp: 'Una por lanzador. El identificador es el de la tienda (por ejemplo, el App ID de Steam), si lo conoces.',
    launcher: 'Lanzador',
    externalId: 'Identificador (opcional)',
    remove: 'Quitar',
    addEdition: 'Añadir una edición',
    apis: 'APIs gráficas',
    apisHelp: 'Marca cada API con la que el juego puede dibujar, aunque sea un modo alternativo.',
    minimumCpu: 'CPU mínima',
    minimumCpuHelp: 'Solo si el juego exige un conjunto de instrucciones, como SSE4.2 en Counter-Strike 2.',
    noRequirement: 'Sin requisito',
    submit: 'Crear juego',
  },
}
