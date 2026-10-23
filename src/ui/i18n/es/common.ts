// Words every page shares: the header, the error pages, and the messages of form fields, domain rules and
// account failures. The domain sends codes; these give each code its text.
import type { AccountFailureCode } from '../../../domain/accounts.ts'
import type { CheckMessage } from '../../../domain/checks.ts'
import type { Mismatch, Rule } from '../../../domain/errors.ts'
import { count } from '../../format.ts'

export const common = {
  /** This language named in itself, for the switcher on the other language's pages. */
  languageName: 'Español',
  title: (page: string) => `${page} · OpenGame Linux`,
  description: 'Mira si un juego de Windows funciona en Linux, según los reportes de jugadores que aprobó un revisor.',

  /** The stamp on content written by the seed's demo accounts. */
  demo: { label: 'Datos de ejemplo', title: 'Aporte de una cuenta de demostración, no de una persona real.' },
  reports: (n: number) => count(n, 'reporte', 'reportes'),
  approvedReports: (n: number) => count(n, 'reporte aprobado', 'reportes aprobados'),

  header: {
    nav: 'Principal',
    catalog: 'Inicio',
    diagnosis: 'Diagnóstico',
    guides: 'Guías',
    requests: 'Pedidos',
    review: 'Revisión',
    signIn: 'Entrar',
    signUp: 'Crear cuenta',
    account: 'Tu cuenta',
    myContributions: 'Mis aportes',
    followed: 'Seguidos',
    newGame: 'Nuevo juego',
    users: 'Usuarios',
    signOut: 'Salir',
    news: (n: number) => count(n, 'juego con novedades', 'juegos con novedades'),
    switchLanguage: 'Ver esta página en español',
  },

  notFound: {
    title: 'No encontramos esa página',
    body: 'Puede que el enlace esté mal escrito o que el contenido ya no exista.',
    home: 'Volver al inicio',
  },

  error: { title: 'Algo falló de nuestro lado', body: 'Intenta de nuevo en unos segundos.' },

  forms: {
    checkValue: 'Revisa este valor.',
    maxLength: (n: number) => `Usa como máximo ${n} caracteres.`,
    minLength: (n: number) => `Usa al menos ${n} caracteres.`,
    gone: 'Lo que intentas modificar ya no existe o no tienes acceso.',
    failed: 'Algo falló de nuestro lado. Intenta de nuevo.',
  },

  checks: {
    required: 'Este campo es obligatorio.',
    fpsRange: 'Escribe un promedio de FPS entre 0 y 99999.99.',
    failureNeeded: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
    apiNeeded: 'Marca al menos una API gráfica.',
    stepNeeded: 'Un perfil necesita al menos un paso.',
    vulkanMinimumNeedsVulkan: 'Una versión mínima de Vulkan solo cabe si el perfil exige Vulkan.',
    vulkanVersionNeedsSupport: 'Solo hay versión de Vulkan si hay soporte.',
    steamStoreRef: 'Pega el enlace de la tienda de Steam (store.steampowered.com/app/…) o su App ID.',
    protonfixesPr: 'Pega el enlace de un PR de umu-protonfixes (github.com/Open-Wine-Components/umu-protonfixes/pull/…).',
    email: 'Escribe un correo válido.',
    passwordNeeded: 'Escribe tu contraseña.',
    detectorOutputNeeded: 'Pega la salida del detector.',
  } satisfies Record<CheckMessage, string>,

  rules: {
    equipo_ajeno: 'Ese diagnóstico no pertenece a uno de tus equipos.',
    diagnostico_no_linux: 'Un reporte necesita un diagnóstico hecho en Linux.',
    fecha_antes_del_diagnostico: 'La prueba no puede ser anterior al diagnóstico.',
    fallo_duplicado: 'Ese tipo de fallo ya está en el reporte; describe ambos síntomas en un solo detalle.',
    perfil_no_disponible: 'Ese perfil ya no está disponible para pruebas.',
    solucion_sin_fallo: 'Ese reporte no registra ese tipo de fallo.',
    solucion_perfil_otra_edicion: 'El perfil recomendado debe ser de la misma edición que el reporte.',
    version_capa_no_exacta: 'Escribe la versión exacta, no «última».',
    autorrevision: 'No puedes revisar tu propio aporte.',
    contenido_inmutable: 'El contenido revisado no se reescribe; registra un aporte nuevo.',
    edicion_repetida: 'Un juego tiene una sola edición por lanzador.',
    identificador_en_uso: 'Ese identificador ya pertenece a otro juego en ese lanzador.',
    arreglo_no_exportable: 'Solo un perfil aprobado de un juego de Steam con AppID y Proton cuenta como arreglo upstream.',
    arreglo_datos_de_ejemplo: 'Los datos de ejemplo no se registran como aportes upstream.',
    arreglo_pr_de_otro_perfil: 'Ese PR ya está registrado para otro perfil.',
    acceso_propio: 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta; pídeselo a otro administrador.',
    ultimo_administrador: 'Es la última cuenta de administrador activa. Da ese rol a otra cuenta antes de cambiar esta.',
    perfil_congelado: 'Este perfil ya se usó o se revisó, así que no cambia. Propón una versión nueva con tus cambios.',
    dependencia_repetida: 'Esa dependencia ya está en el perfil; deja una sola fila para ella.',
    pedido_cerrado: 'Ese pedido ya se cerró: un revisor lo cumplió o lo rechazó.',
  } satisfies Record<Rule, string>,

  mismatches: {
    edicion: (e, o) => `El perfil es para la edición de ${e}; elegiste la de ${o}.`,
    capa: (e, o) => `El perfil usa ${e}; tu prueba usó ${o}.`,
    distribucion: (e, o) => `El perfil es para ${e}; tu diagnóstico es de ${o}.`,
    arquitectura: (e, o) => `El perfil es para ${e}; tu diagnóstico es ${o}.`,
    version_juego: (e, o) => `El perfil es para la versión ${e} del juego; probaste la ${o}.`,
  } satisfies Record<Mismatch['aspect'], (expected: string, actual: string) => string>,

  invalidTransition: 'Este aporte ya fue revisado; registra un aporte nuevo.',

  accountFailures: {
    USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con ese correo. ¿Quieres entrar?',
    INVALID_EMAIL: 'Escribe un correo válido.',
    DOMINIO_RESERVADO: 'Ese dominio está reservado para los datos de ejemplo. Usa otro correo.',
    PASSWORD_TOO_SHORT: 'Usa al menos 8 caracteres.',
    PASSWORD_TOO_LONG: 'Usa como máximo 128 caracteres.',
    INVALID_EMAIL_OR_PASSWORD: 'El correo o la contraseña no coinciden.',
    CUENTA_DESACTIVADA: 'Esta cuenta está desactivada. Un administrador puede reactivarla.',
    TOO_MANY_ATTEMPTS: 'Demasiados intentos seguidos. Espera unos segundos y vuelve a intentarlo.',
  } satisfies Record<AccountFailureCode, string>,
  accountFailed: 'No pudimos completar la operación. Intenta de nuevo.',
}
