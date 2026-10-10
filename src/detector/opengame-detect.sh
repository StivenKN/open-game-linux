#!/usr/bin/env bash
# OpenGame Linux detector. Reads the hardware without root and prints a JSON payload (version 1)
# shaped like the `diagnostico` table. Nothing leaves this computer unless you choose to:
#
#   bash opengame-detect.sh          prints the JSON to paste in the web app
#   bash opengame-detect.sh --open   opens the web app with the payload in the URL fragment (#d=),
#                                    which the browser never sends to the server
#
# OPENGAME_DRY=1 with --open prints the URL instead of opening a browser. OPENGAME_URL overrides the app address.
set -u

APP_URL="${OPENGAME_URL:-__OPENGAME_URL__}"

json_str() { # a JSON string, or null when empty
  if [ -z "${1:-}" ]; then printf 'null'; else
    printf '"%s"' "$(printf '%s' "$1" | tr '\t' ' ' | tr -d '\n\r' | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
}
json_num() { if [ -z "${1:-}" ]; then printf 'null'; else printf '%s' "$1"; fi; }

arquitectura=$(uname -m)
version_sistema=$(uname -r)
distro_nombre=$(. /etc/os-release 2>/dev/null; printf '%s' "${NAME:-}")
distro_version=$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-}")
cpu_modelo=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')

# Installed RAM from online memory blocks (16384 on a 16 GB machine). MemTotal is lower (kernel and
# iGPU reservations) and would fail an exact "8 GB" minimum on an 8 GB laptop.
ram_mb=""
if [ -r /sys/devices/system/memory/block_size_bytes ]; then
  bloques=$(grep -l online /sys/devices/system/memory/memory*/state 2>/dev/null | wc -l)
  [ "$bloques" -gt 0 ] && ram_mb=$(( 0x$(cat /sys/devices/system/memory/block_size_bytes) * bloques / 1048576 ))
fi
[ -z "$ram_mb" ] && ram_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)

# GPU: the first DRM card with a PCI device. The kernel driver and PCI id come from sysfs, which every
# distro has; the name needs lspci, so the server labels the PCI id when the name is missing.
gpu_modelo=""; gpu_pci_id=""; controlador=""; version_controlador=""; vram_mb=""; pci_slot=""
for card in /sys/class/drm/card[0-9]; do
  [ -r "$card/device/uevent" ] || continue
  controlador=$(sed -n 's/^DRIVER=//p' "$card/device/uevent")
  pci_slot=$(sed -n 's/^PCI_SLOT_NAME=//p' "$card/device/uevent")
  gpu_pci_id=$(sed -n 's/^PCI_ID=//p' "$card/device/uevent" | tr 'A-F' 'a-f')
  if [ -r "$card/device/mem_info_vram_total" ]; then # amdgpu
    vram_mb=$(( $(cat "$card/device/mem_info_vram_total") / 1048576 ))
  fi
  break
done
if command -v lspci >/dev/null && [ -n "$pci_slot" ]; then
  gpu_modelo=$(lspci -mm -s "$pci_slot" 2>/dev/null | awk -F'"' '{print $4" "$6}')
fi
if [ "$controlador" = "nvidia" ]; then
  version_controlador=$(sed -n 's/.*Kernel Module *\([0-9.]*\).*/\1/p' /proc/driver/nvidia/version 2>/dev/null | head -1)
  if command -v nvidia-smi >/dev/null; then
    vram_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
    gpu_modelo=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
  fi
else
  version_controlador=$( (dpkg-query -W -f='${Version}' libgl1-mesa-dri 2>/dev/null || rpm -q --qf '%{VERSION}' mesa-dri-drivers 2>/dev/null || pacman -Q mesa 2>/dev/null | awk '{print $2}') | head -1)
  [ -n "$version_controlador" ] && version_controlador="Mesa $version_controlador"
fi

# Vulkan: only vulkaninfo proves support. Mesa installs ICD manifests for GPU families the machine
# may not have, so without vulkaninfo support stays `desconocido` with no version.
soporte_vulkan="desconocido"; version_vulkan=""
if command -v vulkaninfo >/dev/null; then
  version_vulkan=$(vulkaninfo --summary 2>/dev/null | sed -n 's/.*apiVersion *= *\([0-9.]*\).*/\1/p' | head -1)
  if [ -n "$version_vulkan" ]; then soporte_vulkan="si"; else soporte_vulkan="no"; fi
fi

payload="{\"version_esquema\":1,\"capturado_en\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"sistema\":\"Linux\",\"version_sistema\":$(json_str "$version_sistema"),\"distribucion\":{\"nombre\":$(json_str "$distro_nombre"),\"version\":$(json_str "$distro_version")},\"arquitectura\":$(json_str "$arquitectura"),\"cpu_modelo\":$(json_str "$cpu_modelo"),\"gpu_modelo\":$(json_str "$gpu_modelo"),\"gpu_pci_id\":$(json_str "$gpu_pci_id"),\"ram_mb\":$(json_num "$ram_mb"),\"vram_mb\":$(json_num "$vram_mb"),\"controlador\":$(json_str "$controlador"),\"version_controlador\":$(json_str "$version_controlador"),\"soporte_vulkan\":\"$soporte_vulkan\",\"version_vulkan\":$(json_str "$version_vulkan")}"

if [ "${1:-}" != "--open" ]; then
  printf '%s\n' "$payload"
  echo "Copia el JSON de arriba y pégalo en $APP_URL/diagnostico" >&2
  exit 0
fi

url="$APP_URL/diagnostico/importar#d=$(printf '%s' "$payload" | base64 | tr -d '\n=' | tr '+/' '-_')"
if [ "${OPENGAME_DRY:-}" = 1 ]; then
  printf '%s\n' "$url"
elif command -v xdg-open >/dev/null && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  # Some openers wait until the browser exits, so it runs in the background.
  xdg-open "$url" >/dev/null 2>&1 &
  echo "Abriendo OpenGame Linux en tu navegador. Nada se guarda hasta que pulses «Guardar»." >&2
else
  echo "No pudimos abrir el navegador. Abre esta dirección:" >&2
  printf '%s\n' "$url"
fi
