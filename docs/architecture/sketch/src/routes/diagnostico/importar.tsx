// Landing of `opengame-detect.sh --open`: $ORIGIN/diagnostico/importar#d=<base64url>.
// The fragment never reaches the server on navigation. The page strips it from the address bar,
// keeps the raw string in sessionStorage (a guest can log in without losing it), and posts it
// UNTOUCHED to the server, the only parser. The guest sees the evaluation; nothing is stored until
// "Guardar en mi equipo" (login required).
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { evaluarDiagnosticoFn } from '../../fns/aportes.ts'

export const Route = createFileRoute('/diagnostico/importar')({ component: Importar, ssr: false })

const CLAVE = 'opengame:payload'

function Importar() {
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof evaluarDiagnosticoFn>> | null>(null)
  useEffect(() => {
    const fragmento = new URLSearchParams(window.location.hash.slice(1)).get('d')
    if (fragmento) {
      sessionStorage.setItem(CLAVE, fragmento)
      history.replaceState(null, '', window.location.pathname)
    }
    const texto = sessionStorage.getItem(CLAVE)
    if (texto) void evaluarDiagnosticoFn({ data: { _tag: 'detector', texto } }).then(setResultado)
  }, [])
  if (!resultado) return <p>Leyendo tu equipo…</p>
  if (!resultado.ok) return <p role="alert">No reconocemos este diagnóstico ({resultado.fallo.motivo}). Descarga de nuevo el detector.</p>
  return <p>{resultado.valor.captura.gpu_modelo}: {resultado.valor.matriz.length} juegos evaluados.</p>
}
