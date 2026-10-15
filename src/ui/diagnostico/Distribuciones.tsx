import { Link } from '@tanstack/react-router'
import type { DistroEvaluada, VeredictoDistro } from '../../dominio/distros.ts'
import type { GuiaId } from '../../dominio/ids.ts'
import { Insignia } from '../Insignia.tsx'
import { objecion, veredictoDistro } from '../vocabulario.ts'

const GRUPOS = ['sin_objeciones', 'con_ajustes', 'descartada'] as const satisfies ReadonlyArray<VeredictoDistro>

/** Distros ruled out by the hardware, grouped by verdict. Order inside a group is the registry's, never a ranking. */
export function Distribuciones({ evaluadas, guia }: { evaluadas: ReadonlyArray<DistroEvaluada>; guia: GuiaId | null }) {
  return (
    <section className="pila" aria-labelledby="distribuciones">
      <h2 id="distribuciones" className="titulo-seccion">
        Distribuciones
      </h2>
      <p className="tenue">
        No elegimos una por ti. Descartamos las que tu equipo no puede usar y decimos qué ajuste necesita cada una; «sin objeciones» significa que no encontramos
        nada en contra. Para decidir entre ellas, lee{' '}
        {guia === null ? <Link to="/guias">las guías de adopción</Link> : <Link to="/guias/$guiaId" params={{ guiaId: guia }}>¿Qué distribución elegir para jugar?</Link>}.
      </p>
      <div className="mosaico mosaico-ancho">
        {GRUPOS.map((grupo) => {
          const distros = evaluadas.filter((d) => d.veredicto === grupo)
          if (distros.length === 0) return null
          return (
            <section key={grupo} className="tarjeta pila" aria-label={veredictoDistro[grupo].texto}>
              <Insignia etiqueta={veredictoDistro[grupo]} forma="punteado" />
              <ul className="lista-tarjetas">
                {distros.map((d) => (
                  <li key={d.clave} className="pila">
                    <a href={d.url} target="_blank" rel="noreferrer" className="nombre-juego">
                      {d.nombre}
                    </a>
                    {d.objeciones.map((o) => (
                      <p key={o.codigo} className="pequeno tenue">
                        {objecion(o)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}
