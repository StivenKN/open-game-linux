import { Schema } from 'effect'
import { ApprovedTest } from './compatibility.ts'

const approvedTests = Schema.decodeUnknownSync(Schema.Array(ApprovedTest))

const noFps = { fps_promedio: null, resolucion: null, calidad_grafica: null, metodo_medicion: null }

export type Sample = {
  readonly game: string
  readonly tests: ReadonlyArray<ApprovedTest>
  readonly pending: number
}

export const gtaV: Sample = {
  game: 'Grand Theft Auto V',
  pending: 1,
  tests: approvedTests([
    {
      reporte_id: 1, estado_revision: 'aprobado', edicion_id: 1, lanzador: 'Steam', version_juego: '1.0.3179',
      distribucion_id: 1, distribucion: 'Linux Mint 21.3', version_capa_id: 1, capa: 'Proton 8.0-5',
      perfil_id: 1, perfil: 'GTAV-BAJO r2', resultado: 'funciona', fecha_prueba: new Date('2026-09-28T12:00:00Z'),
      fps_promedio: '54.00', resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud · misión Prólogo · 5 min',
      fallos: [],
    },
    {
      reporte_id: 2, estado_revision: 'aprobado', edicion_id: 1, lanzador: 'Steam', version_juego: '1.0.3179',
      distribucion_id: 1, distribucion: 'Linux Mint 21.3', version_capa_id: 1, capa: 'Proton 8.0-5',
      perfil_id: 1, perfil: 'GTAV-BAJO r2', resultado: 'funciona', fecha_prueba: new Date('2026-09-14T12:00:00Z'),
      ...noFps, fallos: [],
    },
    {
      reporte_id: 3, estado_revision: 'aprobado', edicion_id: 2, lanzador: 'Epic (Heroic)', version_juego: '1.0.3179',
      distribucion_id: 2, distribucion: 'Arch Linux', version_capa_id: 2, capa: 'GE-Proton 9-4',
      perfil_id: null, perfil: null, resultado: 'funciona_con_ajustes', fecha_prueba: new Date('2026-09-02T12:00:00Z'),
      fps_promedio: '60.00', resolucion: '1920x1080', calidad_grafica: 'Medio', metodo_medicion: 'MangoHud · conducción en ciudad · 10 min',
      fallos: [],
    },
    {
      reporte_id: 4, estado_revision: 'aprobado', edicion_id: 1, lanzador: 'Steam', version_juego: '1.0.3258',
      distribucion_id: 3, distribucion: 'Fedora 40', version_capa_id: 3, capa: 'Proton 9.0-3',
      perfil_id: null, perfil: null, resultado: 'falla_en_ejecucion', fecha_prueba: new Date('2026-10-02T12:00:00Z'),
      ...noFps, fallos: ['lanzador'],
    },
  ]),
}

export const valorant: Sample = {
  game: 'Valorant',
  pending: 0,
  tests: approvedTests([
    {
      reporte_id: 5, estado_revision: 'aprobado', edicion_id: 3, lanzador: 'Riot Client', version_juego: '9.07',
      distribucion_id: 1, distribucion: 'Linux Mint 21.3', version_capa_id: 4, capa: 'Wine 9.0',
      perfil_id: null, perfil: null, resultado: 'no_inicia', fecha_prueba: new Date('2026-07-11T12:00:00Z'),
      ...noFps, fallos: ['anti_cheat'],
    },
    {
      reporte_id: 6, estado_revision: 'aprobado', edicion_id: 3, lanzador: 'Riot Client', version_juego: '9.07',
      distribucion_id: 2, distribucion: 'Arch Linux', version_capa_id: 2, capa: 'GE-Proton 9-4',
      perfil_id: null, perfil: null, resultado: 'no_inicia', fecha_prueba: new Date('2026-08-03T12:00:00Z'),
      ...noFps, fallos: ['anti_cheat'],
    },
  ]),
}

export const ets2: Sample = { game: 'Euro Truck Simulator 2', pending: 2, tests: [] }
