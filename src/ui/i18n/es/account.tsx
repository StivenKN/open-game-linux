import type { ReactNode } from 'react'
import { count } from '../../format.ts'

/** Words of a sentence that the page wraps in a link: the dictionary picks them, the page renders the link. */
type Linked = (text: string) => ReactNode

/** The account pages: /entrar, /registro, /mis-aportes and the admin's /admin/usuarios. Their titles are the header's labels. */
export const account = {
  email: 'Correo',
  password: 'Contraseña',

  signIn: {
    lede: 'Entra para guardar tu diagnóstico y publicar reportes.',
    submit: 'Entrar',
    submitting: 'Entrando…',
    noAccount: (signUp: Linked) => <>¿No tienes cuenta? {signUp('Crea una')}.</>,
  },

  signUp: {
    lede: 'Los demás solo verán tu alias. Tu correo no se muestra en ningún aporte.',
    alias: 'Alias',
    submit: 'Crear cuenta',
    submitting: 'Creando cuenta…',
    haveAccount: (signIn: Linked) => <>¿Ya tienes cuenta? {signIn('Entra')}.</>,
  },

  myContributions: {
    lede: 'Lo que enviaste y en qué va su revisión. Un aporte cuenta en los resúmenes solo cuando un revisor lo aprueba; si lo rechaza o lo retira, aquí ves el motivo.',
    empty: 'Todavía no tienes aportes.',
    diagnose: 'Haz el diagnóstico de tu equipo',
    thenReport: 'y luego reporta cómo te funcionó un juego desde su ficha.',
    reports: 'Reportes',
    solutions: 'Soluciones',
    profiles: 'Perfiles de configuración',
    requests: 'Pedidos de juegos',
    version: (version: string) => `versión ${version}`,
    testedOn: (date: string) => `probado el ${date}`,
    valve: 'Prepara el informe para Valve',
    forFailureIn: (failure: ReactNode, game: ReactNode) => <>Para {failure} en {game}</>,
    forGame: (game: ReactNode) => <>Para {game}</>,
    editProposal: 'Editar la propuesta',
    proposeChanges: 'Proponer una versión con cambios',
    requestedOn: (date: string) => `Pedido el ${date}`,
    requesters: (n: number) => count(n, 'persona lo pide', 'personas lo piden'),
    viewOpen: 'Verlo en los pedidos abiertos',
    added: (date: string) => `Un revisor lo agregó el ${date}.`,
    viewGame: (game: string) => `Ver la ficha de ${game}`,
    rejected: (date: string, reason: string) => `Un revisor lo rechazó el ${date}. Motivo: ${reason}`,
    diagnoses: 'Diagnósticos guardados',
    diagnosesHelp: 'Solo tú los ves. Un reporte muestra el contexto técnico de su diagnóstico, no tu correo.',
    sentOn: (date: string) => `Enviado el ${date}`,
    reviewReason: (reason: string) => `Motivo de la revisión: ${reason}`,
  },

  users: {
    lede: 'Un revisor aprueba aportes; un administrador además gestiona los roles. Desactivar una cuenta cierra sus sesiones y no la deja entrar hasta que la reactives. Cada cambio se aplica en la siguiente página que abra esa cuenta.',
    searchLabel: 'Buscar por alias o correo',
    searchPlaceholder: 'Alias o correo',
    search: 'Buscar',
    none: 'Todavía no hay cuentas.',
    noMatch: (q: string) => `Ninguna cuenta tiene «${q}» en su alias o correo.`,
    more: (n: number) => `Se muestran las ${n} cuentas más recientes. Busca por alias o correo para encontrar otra.`,
    deactivated: 'Desactivada',
    yours: 'Tu cuenta',
    since: (date: string) => `desde el ${date}`,
    self: 'Es tu cuenta: otro administrador debe cambiar tu rol o desactivarla.',
    role: 'Rol',
    active: 'Cuenta activa',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado.',
    unchanged: 'No había nada que cambiar.',
  },
}
