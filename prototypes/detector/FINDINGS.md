# Q1 detector prototype (throwaway)

`opengame-detect.sh` (4.5 KB, bash, no root). Observed on 2026-10-10:

- Host Ubuntu 24.04, Iris Xe, uid 1000: full payload in 0.05 s, 10 MB RSS. CPU, RAM, kernel, arch, distro, i915 driver, Mesa 25.2.8, GPU name all detected.
- Debian 12 and Fedora 42 containers (no lspci, no Mesa package): `gpu_modelo` and `version_controlador` come back null. The kernel driver and PCI id (`8086:9A49` in sysfs uevent) are still readable. Fallback: send the PCI id and let the server label it.
- Arch container: `VERSION_ID` is a build date (`20261004.0.606936`). Rolling distros need a server-side mapping to version `rolling`.
- Vulkan without `vulkaninfo` (stock Ubuntu ships without vulkan-tools): Mesa installs ICD manifests for every driver family (asahi, nouveau, radeon, intel...), so an ICD file is not proof of support. The script reports `soporte_vulkan: desconocido`. A stubbed `vulkaninfo` on PATH flips it to `si` + version.
- Handoff by URL fragment: payload is 740 chars as base64url, decoded in JS with atob + TextDecoder, round trip verified. The fragment never reaches the server, which keeps the "telemetría 100% local" promise until the user presses save.

Decisions:
1. Handoff: `--open` URL fragment primary; paste-JSON textarea fallback (SSH sessions, no xdg-open). No file upload.
2. Vulkan: never infer support from ICD files. Store `desconocido` + null version. The UI offers the wireframe's manual check command (`vulkaninfo --summary`) and a "confirmar Vulkan" step that re-runs the script.
3. Payload carries `version_esquema` so the server parser can reject or migrate old scripts.
4. Payload is parsed at the server boundary into the `diagnostico` shape. Server owns distro normalization (rolling) and PCI-id labels.

## Follow-up: installed RAM (2026-10-10)
`MemTotal` reads 15766 MB on a 16 GB machine, so an exact comparison would fail "8 GB" minimums on 8 GB laptops. Online memory blocks in `/sys/devices/system/memory` (no root) give 128 x 128 MiB = 16384 MB, the nominal size, on the host and inside a Debian container. The script now reports that and falls back to `MemTotal` when sysfs memory blocks are absent. Decision: the evaluation compares RAM exactly as 8.10 says, with no tolerance factor.
