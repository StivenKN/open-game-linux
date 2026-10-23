import { Schema } from 'effect'
import { SteamAppId, SteamLibrary } from './library.ts'
import { GameRequestStatus } from './game-requests.ts'
import { OperatingSystem, VulkanSupport } from './evaluation.ts'
import { PciId } from './gpu.ts'
import { GuideStatus, GuideType } from './guides.ts'
import {
  DependencyId,
  DiagnosticId,
  DistributionId,
  EditionId,
  MachineId,
  GuideId,
  GameId,
  GameRequestId,
  LauncherId,
  ProfileId,
  ReportId,
  SolutionId,
  RequiredText,
  OptionalTextOf,
  FailureTypeId,
  UserId,
  LayerVersionId,
} from './ids.ts'
import { maxLengths } from './max-lengths.ts'
import { GraphicsApi, LayerFamily, Outcome, ProtonVariant } from './literals.ts'
import { SecureBoot, X86Level, Tpm } from './platform.ts'
import { ReviewStatus, Role } from './review.ts'

export const TextUpTo = (n: number) => RequiredText.pipe(Schema.check(Schema.isMaxLength(n)))

export const OptionalTextUpTo = (n: number) => OptionalTextOf(TextUpTo(n))

const Positive = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Created by better-auth (server/schema/auth.ts). `image` is better-auth's own unmapped column. */
export const User = Schema.Struct({
  id: UserId,
  alias: TextUpTo(maxLengths.app_user.alias),
  email: TextUpTo(maxLengths.app_user.email),
  email_verified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  created_at: Schema.Date,
  updated_at: Schema.Date,
  role: Role,
  active: Schema.Boolean,
})
export type User = typeof User.Type

export const Machine = Schema.Struct({
  id: MachineId,
  user_id: UserId,
  alias: TextUpTo(maxLengths.machine.alias),
  created_at: Schema.Date,
})
export type Machine = typeof Machine.Type

export const Diagnostic = Schema.Struct({
  id: DiagnosticId,
  machine_id: MachineId,
  captured_at: Schema.Date,
  operating_system: OperatingSystem,
  os_version: TextUpTo(maxLengths.diagnostic.os_version),
  distribution_id: Schema.NullOr(DistributionId),
  architecture: TextUpTo(maxLengths.diagnostic.architecture),
  cpu_model: TextUpTo(maxLengths.diagnostic.cpu_model),
  gpu_model: TextUpTo(maxLengths.diagnostic.gpu_model),
  ram_mb: Positive,
  vram_mb: Schema.NullOr(NonNegative),
  driver: Schema.NullOr(TextUpTo(maxLengths.diagnostic.driver)),
  driver_version: Schema.NullOr(TextUpTo(maxLengths.diagnostic.driver_version)),
  vulkan_support: VulkanSupport,
  vulkan_version: Schema.NullOr(TextUpTo(maxLengths.diagnostic.vulkan_version)),
  gpu_pci_id: Schema.NullOr(PciId),
  steam_library: Schema.NullOr(SteamLibrary),
  // NULL: not captured (old detectors, Windows, the manual form).
  x86_level: Schema.NullOr(X86Level),
  secure_boot: Schema.NullOr(SecureBoot),
  tpm: Schema.NullOr(Tpm),
  zram_mb: Schema.NullOr(NonNegative),
  swap_mb: Schema.NullOr(NonNegative),
})
export type Diagnostic = typeof Diagnostic.Type

export const Game = Schema.Struct({
  id: GameId,
  title: TextUpTo(maxLengths.game.title),
  description: RequiredText,
  x86_level_min: Schema.NullOr(X86Level),
  updated_at: Schema.Date,
})
export type Game = typeof Game.Type

/** One row per graphics API the game can render with; no rows means unknown. */
export const GameApi = Schema.Struct({ game_id: GameId, api: GraphicsApi })
export type GameApi = typeof GameApi.Type

export const Launcher = Schema.Struct({
  id: LauncherId,
  name: TextUpTo(maxLengths.launcher.name),
  official_url: Schema.NullOr(TextUpTo(maxLengths.launcher.official_url)),
})
export type Launcher = typeof Launcher.Type

export const GameEdition = Schema.Struct({
  id: EditionId,
  game_id: GameId,
  launcher_id: LauncherId,
  external_id: Schema.NullOr(TextUpTo(maxLengths.game_edition.external_id)),
  updated_at: Schema.Date,
})
export type GameEdition = typeof GameEdition.Type

export const Distribution = Schema.Struct({
  id: DistributionId,
  name: TextUpTo(maxLengths.distribution.name),
  version: TextUpTo(maxLengths.distribution.version),
  official_url: Schema.NullOr(TextUpTo(maxLengths.distribution.official_url)),
})
export type Distribution = typeof Distribution.Type

export const LayerVersion = Schema.Struct({
  id: LayerVersionId,
  family: LayerFamily,
  variant: TextUpTo(maxLengths.layer_version.variant),
  version: TextUpTo(maxLengths.layer_version.version),
})
export type LayerVersion = typeof LayerVersion.Type

export const ReviewFields = Schema.Struct({
  review_status: ReviewStatus,
  reviewer_id: Schema.NullOr(UserId),
  reviewed_at: Schema.NullOr(Schema.Date),
  review_reason: Schema.NullOr(RequiredText),
  review_evidence: Schema.NullOr(RequiredText),
})
export type ReviewFields = typeof ReviewFields.Type

export const Profile = Schema.Struct({
  id: ProfileId,
  edition_id: EditionId,
  distribution_id: DistributionId,
  layer_version_id: LayerVersionId,
  author_id: UserId,
  architecture: TextUpTo(maxLengths.profile.architecture),
  revision: Positive,
  title: TextUpTo(maxLengths.profile.title),
  target_game_version: Schema.NullOr(TextUpTo(maxLengths.profile.target_game_version)),
  ram_min_mb: Schema.NullOr(Positive),
  vram_min_mb: Schema.NullOr(NonNegative),
  requires_vulkan: Schema.NullOr(Schema.Boolean),
  vulkan_version_min: Schema.NullOr(TextUpTo(maxLengths.profile.vulkan_version_min)),
  cpu_requirement: Schema.NullOr(RequiredText),
  gpu_requirement: Schema.NullOr(RequiredText),
  launch_options: Schema.NullOr(RequiredText),
  created_at: Schema.Date,
  ...ReviewFields.fields,
})
export type Profile = typeof Profile.Type

export const ProfileStep = Schema.Struct({
  profile_id: ProfileId,
  position: Positive,
  title: TextUpTo(maxLengths.profile_step.title),
  instruction: RequiredText,
})
export type ProfileStep = typeof ProfileStep.Type

export const Dependency = Schema.Struct({
  id: DependencyId,
  name: TextUpTo(maxLengths.dependency.name),
  package_manager: TextUpTo(maxLengths.dependency.package_manager),
  description: RequiredText,
})
export type Dependency = typeof Dependency.Type

export const ProfileDependency = Schema.Struct({
  profile_id: ProfileId,
  dependency_id: DependencyId,
  required_version: Schema.NullOr(TextUpTo(maxLengths.profile_dependency.required_version)),
  required: Schema.Boolean,
  install_instruction: RequiredText,
})
export type ProfileDependency = typeof ProfileDependency.Type

export const FailureType = Schema.Struct({
  id: FailureTypeId,
  code: TextUpTo(maxLengths.failure_type.code),
  description: RequiredText,
})
export type FailureType = typeof FailureType.Type

export const Report = Schema.Struct({
  id: ReportId,
  edition_id: EditionId,
  diagnostic_id: DiagnosticId,
  layer_version_id: LayerVersionId,
  profile_id: Schema.NullOr(ProfileId),
  game_version: TextUpTo(maxLengths.report.game_version),
  launcher_version: Schema.NullOr(TextUpTo(maxLengths.report.launcher_version)),
  tested_at: Schema.Date,
  outcome: Outcome,
  avg_fps: Schema.NullOr(Schema.FiniteFromString), // numeric(7,2) arrives as text (probes.md (c))
  resolution: Schema.NullOr(TextUpTo(maxLengths.report.resolution)),
  graphics_quality: Schema.NullOr(TextUpTo(maxLengths.report.graphics_quality)),
  measurement_method: Schema.NullOr(RequiredText),
  observations: RequiredText,
  created_at: Schema.Date,
  ...ReviewFields.fields,
})
export type Report = typeof Report.Type

export const ReportFailure = Schema.Struct({
  report_id: ReportId,
  failure_type_id: FailureTypeId,
  detail: RequiredText,
})
export type ReportFailure = typeof ReportFailure.Type

export const Solution = Schema.Struct({
  id: SolutionId,
  report_id: ReportId,
  failure_type_id: FailureTypeId,
  author_id: UserId,
  profile_id: Schema.NullOr(ProfileId),
  title: TextUpTo(maxLengths.solution.title),
  instructions: RequiredText,
  created_at: Schema.Date,
  ...ReviewFields.fields,
})
export type Solution = typeof Solution.Type

export const AdoptionGuide = Schema.Struct({
  id: GuideId,
  author_id: UserId,
  distribution_id: Schema.NullOr(DistributionId),
  type: GuideType,
  title: TextUpTo(maxLengths.adoption_guide.title),
  content: RequiredText,
  revision: Positive,
  status: GuideStatus,
  created_at: Schema.Date,
  updated_at: Schema.Date,
})
export type AdoptionGuide = typeof AdoptionGuide.Type

/** One Steam edition's aggregate of a ProtonDB export. Never individual reports (8.9). */
export const ProtonDbSummary = Schema.Struct({
  edition_id: EditionId,
  exported_at: Schema.Date,
  total_reports: Positive,
  recent: NonNegative,
  recent_working: NonNegative,
  modest_recent: NonNegative,
  modest_working: NonNegative,
  latest_report: Schema.Date,
  layer_variant: Schema.NullOr(ProtonVariant),
  layer_version: Schema.NullOr(TextUpTo(maxLengths.protondb_summary.layer_version)),
  layer_reports: NonNegative,
})
export type ProtonDbSummary = typeof ProtonDbSummary.Type

/** A user following a game. `seen_at` is when they last marked it seen; approvals after it are news. */
export const GameFollow = Schema.Struct({
  user_id: UserId,
  game_id: GameId,
  seen_at: Schema.Date,
  created_at: Schema.Date,
})
export type GameFollow = typeof GameFollow.Type

/** A game someone wants in the catalog. Its requesters are rows of `game_request_user`. */
export const GameRequest = Schema.Struct({
  id: GameRequestId,
  title: TextUpTo(maxLengths.game.title),
  steam_app_id: Schema.NullOr(SteamAppId),
  status: GameRequestStatus,
  created_at: Schema.Date,
  // NULL while abierto; who closed it and when otherwise.
  resolved_by: Schema.NullOr(UserId),
  resolved_at: Schema.NullOr(Schema.Date),
  rejection_reason: Schema.NullOr(RequiredText),
  game_id: Schema.NullOr(GameId),
})
export type GameRequest = typeof GameRequest.Type

export const GameRequestUser = Schema.Struct({ request_id: GameRequestId, user_id: UserId, created_at: Schema.Date })
export type GameRequestUser = typeof GameRequestUser.Type
