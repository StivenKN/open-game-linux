import type { ReactNode } from 'react'

/** A game's page (`/juegos/12`). Its parts in `ui/compatibility/` have their own area. */
export const game = {
  report: 'Reportar un resultado',
  breadcrumbs: 'Migas de pan',
  catalog: 'Catálogo',
  editions: 'Ediciones',
  noApis: 'APIs gráficas sin declarar',
  graphics: (apis: string) => `Gráficos: ${apis}`,
  minimumCpu: (level: string) => `CPU mínima: ${level}`,
  steamDeck: 'En Steam Deck:',
  noSteamDeck: 'nadie ha aprobado una prueba en una Steam Deck',
  latestDiagnosis: (machine: string, date: string) => `Según tu diagnóstico más reciente: ${machine}, ${date}.`,
  setups: { heading: 'Dónde lo probaron', intro: 'Cada fila es un entorno con reportes aprobados.' },
  history: {
    heading: 'Historial por versión',
    intro: 'Cada paso es una versión de Proton, Wine o nativa, en el orden en que se probó por primera vez. Cuentan todos los reportes aprobados, de cualquier fecha.',
  },
  profiles: {
    heading: 'Perfiles de configuración',
    none: 'Todavía no hay perfiles para este juego.',
    testing: 'en prueba',
    pending: 'Aún no está aprobado y ningún revisor ha leído sus pasos. Si lo pruebas, tu reporte aporta la evidencia que su aprobación necesita.',
    yourMachine: 'Tu equipo:',
    propose: 'Proponer un perfil',
  },
  causes: {
    heading: 'Causas y soluciones',
    none: 'Ningún reporte aprobado registra un fallo.',
    noSolutions: 'Sin soluciones verificadas todavía.',
    by: (author: string, profile: string | null): ReactNode => (
      <>
        Aportada por {author}
        {profile !== null && <>. Recomienda el perfil {profile}</>}.
      </>
    ),
    propose: 'Proponer una solución',
  },
  played: {
    heading: '¿Lo jugaste en Linux?',
    intro: 'Cuenta en qué distribución y con qué configuración. Un revisor lo aprueba y pasa a contar.',
    detector:
      '¿No sabes tu versión de Proton? Ejecuta esto en el equipo donde jugaste: lee la herramienta de compatibilidad que Steam usa para este juego, sus opciones de lanzamiento y su build, y abre el formulario lleno para que lo revises.',
    detectorLabel: 'Reportar con el detector, en Linux',
    noWindows: 'En Windows no hay modo de reporte: un reporte necesita un diagnóstico hecho en Linux.',
  },
}
