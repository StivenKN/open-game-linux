import { count } from '../../format.ts'
import type { common as source } from '../es/common.ts'

export const common = {
  languageName: 'English',
  title: (page) => `${page} · OpenGame Linux`,
  description: 'See whether a Windows game works on Linux, from player reports a reviewer approved.',

  demo: { label: 'Demo data', title: 'A contribution from a demo account, not from a real person.' },
  reports: (n) => count(n, 'report', 'reports'),
  approvedReports: (n) => count(n, 'approved report', 'approved reports'),

  header: {
    nav: 'Main',
    catalog: 'Home',
    diagnosis: 'Diagnosis',
    guides: 'Guides',
    requests: 'Requests',
    review: 'Review',
    signIn: 'Sign in',
    signUp: 'Create account',
    account: 'Your account',
    myContributions: 'My contributions',
    followed: 'Followed games',
    newGame: 'New game',
    users: 'Users',
    signOut: 'Sign out',
    news: (n) => count(n, 'game with news', 'games with news'),
    switchLanguage: 'Read this page in English',
  },

  notFound: {
    title: "We couldn't find that page",
    body: 'The link may be mistyped, or the content may no longer exist.',
    home: 'Back to the home page',
  },

  error: { title: 'Something went wrong on our side', body: 'Try again in a few seconds.' },

  forms: {
    checkValue: 'Check this value.',
    maxLength: (n) => `Use ${n} characters at most.`,
    minLength: (n) => `Use at least ${n} characters.`,
    gone: "What you're trying to change no longer exists, or you don't have access to it.",
    failed: 'Something went wrong on our side. Try again.',
  },

  checks: {
    required: 'This field is required.',
    fpsRange: 'Enter an average FPS between 0 and 99999.99.',
    failureNeeded: "If it doesn't start or crashes, give at least one failure type (use “other” if you don't know the cause).",
    apiNeeded: 'Tick at least one graphics API.',
    stepNeeded: 'A profile needs at least one step.',
    vulkanMinimumNeedsVulkan: 'A minimum Vulkan version only fits if the profile requires Vulkan.',
    vulkanVersionNeedsSupport: 'There is only a Vulkan version if there is Vulkan support.',
    steamStoreRef: 'Paste the Steam store link (store.steampowered.com/app/…) or its App ID.',
    protonfixesPr: 'Paste the link of an umu-protonfixes PR (github.com/Open-Wine-Components/umu-protonfixes/pull/…).',
    email: 'Enter a valid email address.',
    passwordNeeded: 'Enter your password.',
    detectorOutputNeeded: "Paste the detector's output.",
  },

  rules: {
    equipo_ajeno: "That diagnosis doesn't belong to one of your machines.",
    diagnostico_no_linux: 'A report needs a diagnosis made on Linux.',
    fecha_antes_del_diagnostico: "The test can't be earlier than the diagnosis.",
    fallo_duplicado: 'That failure type is already in the report; describe both symptoms in a single detail.',
    perfil_no_disponible: 'That profile is no longer available for tests.',
    solucion_sin_fallo: "That report doesn't record that failure type.",
    solucion_perfil_otra_edicion: 'The recommended profile must be for the same edition as the report.',
    version_capa_no_exacta: 'Enter the exact version, not “latest”.',
    autorrevision: "You can't review your own contribution.",
    contenido_inmutable: "Reviewed content isn't rewritten; submit a new contribution.",
    edicion_repetida: 'A game has a single edition per launcher.',
    identificador_en_uso: 'That id already belongs to another game on that launcher.',
    arreglo_no_exportable: 'Only an approved profile of a Steam game with an AppID and Proton counts as an upstream fix.',
    arreglo_datos_de_ejemplo: "Demo data isn't recorded as an upstream contribution.",
    arreglo_pr_de_otro_perfil: 'That PR is already recorded for another profile.',
    acceso_propio: "You can't remove your own administrator role or deactivate your own account; ask another administrator.",
    ultimo_administrador: 'This is the last active administrator account. Give that role to another account before changing this one.',
    perfil_congelado: "This profile was already used or reviewed, so it doesn't change. Propose a new version with your changes.",
    dependencia_repetida: 'That dependency is already in the profile; keep a single row for it.',
    pedido_cerrado: 'That request is already closed: a reviewer fulfilled or rejected it.',
  },

  mismatches: {
    edicion: (e, o) => `The profile is for the ${e} edition; you picked the ${o} one.`,
    capa: (e, o) => `The profile uses ${e}; your test used ${o}.`,
    distribucion: (e, o) => `The profile is for ${e}; your diagnosis is from ${o}.`,
    arquitectura: (e, o) => `The profile is for ${e}; your diagnosis is ${o}.`,
    version_juego: (e, o) => `The profile is for version ${e} of the game; you tested ${o}.`,
  },

  invalidTransition: 'This contribution was already reviewed; submit a new one.',

  accountFailures: {
    USER_ALREADY_EXISTS: 'An account with that email already exists. Do you want to sign in?',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with that email already exists. Do you want to sign in?',
    INVALID_EMAIL: 'Enter a valid email address.',
    DOMINIO_RESERVADO: 'That domain is reserved for the demo data. Use another email address.',
    PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
    PASSWORD_TOO_LONG: 'Use 128 characters at most.',
    INVALID_EMAIL_OR_PASSWORD: "The email or the password doesn't match.",
    CUENTA_DESACTIVADA: 'This account is deactivated. An administrator can reactivate it.',
    TOO_MANY_ATTEMPTS: 'Too many attempts in a row. Wait a few seconds and try again.',
  },
  accountFailed: "We couldn't complete that. Try again.",
} satisfies typeof source
