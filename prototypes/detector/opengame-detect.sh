#!/usr/bin/env bash
# Throwaway prototype for Q1. Detects hardware without root and prints a JSON
# payload shaped like the `diagnostico` table. With --open it hands the payload
# to the web app through a URL fragment, which the browser never sends to the server.
set -u

APP_URL="${OPENGAME_URL:-http://localhost:8000}"

json_str() { # prints a JSON string or null
  if [ -z "${1:-}" ]; then printf 'null'; else
    printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r')"; fi
}
json_num() { if [ -z "${1:-}" ]; then printf 'null'; else printf '%s' "$1"; fi; }

arquitectura=$(uname -m)
version_sistema=$(uname -r)
distro_nombre=$(. /etc/os-release 2>/dev/null; printf '%s' "${NAME:-}")
distro_version=$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-}")
cpu_modelo=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')
# Installed RAM from online memory blocks (matches the sticker: 16384 for 16 GB).
# MemTotal is lower (kernel and iGPU reservations) and would fail an "8 GB" minimum on an 8 GB laptop.
ram_mb=""
if [ -r /sys/devices/system/memory/block_size_bytes ]; then
  bloques=$(grep -l online /sys/devices/system/memory/memory*/state 2>/dev/null | wc -l)
  [ "$bloques" -gt 0 ] && ram_mb=$(( 0x$(cat /sys/devices/system/memory/block_size_bytes) * bloques / 1048576 ))
fi
[ -z "$ram_mb" ] && ram_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)

# GPU: first DRM card with a PCI device. Kernel driver comes from sysfs, name from lspci.
gpu_modelo=""; controlador=""; version_controlador=""; vram_mb=""; pci_slot=""
for card in /sys/class/drm/card[0-9]; do
  [ -r "$card/device/uevent" ] || continue
  controlador=$(sed -n 's/^DRIVER=//p' "$card/device/uevent")
  pci_slot=$(sed -n 's/^PCI_SLOT_NAME=//p' "$card/device/uevent")
  if [ -r "$card/device/mem_info_vram_total" ]; then # amdgpu exposes this
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
  # Mesa version from the package manager; no root needed.
  version_controlador=$( (dpkg-query -W -f='${Version}' libgl1-mesa-dri 2>/dev/null || rpm -q --qf '%{VERSION}' mesa-dri-drivers 2>/dev/null || pacman -Q mesa 2>/dev/null | awk '{print $2}') | head -1)
  [ -n "$version_controlador" ] && version_controlador="Mesa $version_controlador"
fi

# Vulkan: vulkaninfo is authoritative. Without it we only know which ICD the kernel
# driver would load, and Mesa installs ICDs for GPUs that may not support Vulkan.
soporte_vulkan="desconocido"; version_vulkan=""; vulkan_fuente="ninguna"
if command -v vulkaninfo >/dev/null; then
  version_vulkan=$(vulkaninfo --summary 2>/dev/null | sed -n 's/.*apiVersion *= *\([0-9.]*\).*/\1/p' | head -1)
  if [ -n "$version_vulkan" ]; then soporte_vulkan="si"; else soporte_vulkan="no"; fi
  vulkan_fuente="vulkaninfo"
else
  case "$controlador" in
    i915|xe) icd=intel_icd ;; amdgpu) icd=radeon_icd ;; nvidia) icd=nvidia_icd ;; nouveau) icd=nouveau_icd ;; *) icd="" ;;
  esac
  for dir in /usr/share/vulkan/icd.d /etc/vulkan/icd.d; do
    f=$(ls "$dir"/${icd}*.json 2>/dev/null | head -1)
    if [ -n "$icd" ] && [ -n "$f" ]; then
      version_vulkan=$(sed -n 's/.*"api_version": *"\([0-9.]*\)".*/\1/p' "$f")
      vulkan_fuente="icd:$(basename "$f")"; break
    fi
  done
  # The ICD version is the driver's ceiling, not proof the GPU supports it, so support stays unknown.
fi

payload=$(cat <<EOF
{"version_esquema":1,"capturado_en":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","sistema":"Linux","version_sistema":$(json_str "$version_sistema"),"distribucion":{"nombre":$(json_str "$distro_nombre"),"version":$(json_str "$distro_version")},"arquitectura":$(json_str "$arquitectura"),"cpu_modelo":$(json_str "$cpu_modelo"),"gpu_modelo":$(json_str "$gpu_modelo"),"ram_mb":$(json_num "$ram_mb"),"vram_mb":$(json_num "$vram_mb"),"controlador":$(json_str "$controlador"),"version_controlador":$(json_str "$version_controlador"),"soporte_vulkan":"$soporte_vulkan","version_vulkan":$(json_str "$version_vulkan"),"vulkan_fuente":$(json_str "$vulkan_fuente")}
EOF
)

printf '%s\n' "$payload"
if [ "${1:-}" = "--open" ]; then
  frag=$(printf '%s' "$payload" | base64 -w0 | tr '+/' '-_' | tr -d '=')
  url="$APP_URL/diagnostico/importar#d=$frag"
  echo "URL (${#url} chars): $url" >&2
  command -v xdg-open >/dev/null && [ "${OPENGAME_DRY:-}" != 1 ] && xdg-open "$url" >/dev/null 2>&1 &
fi
