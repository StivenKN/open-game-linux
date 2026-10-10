// The ONLY parser of opengame-detect.sh output (fixed decision: parsed only on the server).
// Pure, no DB, unit-tested on prototypes/detector/out.json. It lives under servidor/ (not dominio/)
// so the browser cannot import it: fronteras.test.ts forbids routes/ and ui/ from importing servidor/.
//
// Accepts what reaches the server by either handoff path:
//   - the fragment value posted untouched by /diagnostico/importar (base64url JSON)
//   - pasted text: raw JSON, the base64url string, or the whole URL containing "#d="
import { Result, Schema } from 'effect'
import type { Captura } from '../../dominio/aportes.ts'
import { PayloadInvalido } from '../../dominio/fallos.ts'

export const VERSION_ESQUEMA = 1

/** Payload v1 = the prototype's out.json plus gpu_pci_id ("8086:9a49"). Wire shape only; never leaves this file. */
const PayloadV1 = Schema.Struct({
  version_esquema: Schema.Literal(VERSION_ESQUEMA),
  capturado_en: Schema.String,
  sistema: Schema.Literal('Linux'), // the script only runs on Linux
  version_sistema: Schema.String,
  distribucion: Schema.Struct({ nombre: Schema.String, version: Schema.NullOr(Schema.String) }),
  arquitectura: Schema.String,
  cpu_modelo: Schema.String,
  gpu_modelo: Schema.NullOr(Schema.String),
  gpu_pci_id: Schema.NullOr(Schema.String),
  ram_mb: Schema.Int,
  vram_mb: Schema.NullOr(Schema.Int),
  controlador: Schema.NullOr(Schema.String),
  version_controlador: Schema.NullOr(Schema.String),
  soporte_vulkan: Schema.Literals(['si', 'no', 'desconocido']),
  version_vulkan: Schema.NullOr(Schema.String),
})

/**
 * 1. trim; keep only what follows "#d=" when present
 * 2. not starting with "{": base64url-decode (-_ -> +/, pad), UTF-8 via TextDecoder; failure -> ilegible
 * 3. JSON.parse; failure -> ilegible
 * 4. version_esquema !== 1 -> version_esquema ("Descarga de nuevo el detector")
 * 5. decode PayloadV1 then Captura; failure -> campo_invalido with the first issue path
 * Normalization (server-owned, per detector FINDINGS):
 *   - distribucion.version: empty or /^\d{8}/ (Arch build date) -> "rolling"; a rule, not a list
 *   - soporte_vulkan !== 'si' -> version_vulkan = null (the ICD ceiling version is dropped)
 *   - gpu_modelo null -> etiquetaPci(gpu_pci_id) ?? 'GPU no detectada'
 */
export const parsearPayload = (texto: string): Result.Result<Captura, PayloadInvalido> => {
  void texto
  void PayloadV1
  throw new Error('not implemented')
}

/** "8086:9a49" -> "Intel GPU [8086:9a49]". Three vendors, no device database (round 1 cut). */
export const etiquetaPci = (pci: string | null): string | null => {
  void pci
  throw new Error('not implemented')
}
