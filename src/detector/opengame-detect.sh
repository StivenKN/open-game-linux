#!/usr/bin/env bash
# OpenGame Linux detector. Reads the hardware without root and prints a JSON payload (version 1)
# shaped like the `diagnostico` table. Nothing leaves this computer unless you choose to:
#
#   bash opengame-detect.sh          prints the JSON to paste in the web app
#   bash opengame-detect.sh --open   opens the web app with the payload in the URL fragment (#d=),
#                                    which the browser never sends to the server
#
# OPENGAME_DRY=1 with --open prints the URL instead of opening a browser. OPENGAME_URL overrides the app address.
# OPENGAME_STEAM_DIR adds a Steam folder to the ones searched for installed games. OPENGAME_MAX_JUEGOS
# overrides how many games are sent, which the server fills in like the URL.
set -u

APP_URL="${OPENGAME_URL:-__OPENGAME_URL__}"
MAX_JUEGOS="${OPENGAME_MAX_JUEGOS:-__OPENGAME_MAX_JUEGOS__}"
case "$MAX_JUEGOS" in ''|*[!0-9]*) MAX_JUEGOS=0 ;; esac

json_str() {
  if [ -z "${1:-}" ]; then printf 'null'; else
    printf '"%s"' "$(printf '%s' "$1" | tr '\t' ' ' | tr -d '\000-\037\177' | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
}
json_num() { # a JSON integer, or null for anything else (nvidia-smi prints "[N/A]")
  case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac
}

arquitectura=$(uname -m)
version_sistema=$(uname -r)
distro_nombre=$(. /etc/os-release 2>/dev/null; printf '%s' "${NAME:-}")
distro_version=$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-}")
# x86 names the CPU in /proc/cpuinfo; ARM kernels often do not, while lscpu still does.
cpu_modelo=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')
[ -z "$cpu_modelo" ] && command -v lscpu >/dev/null && cpu_modelo=$(lscpu 2>/dev/null | sed -n 's/^Model name: *//p' | head -1)
[ -z "$cpu_modelo" ] && cpu_modelo=$(grep -m1 '^Hardware' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')

# Installed RAM from online memory blocks (16384 on a 16 GB machine). MemTotal is lower (kernel and
# iGPU reservations) and would fail an exact "8 GB" minimum on an 8 GB laptop.
ram_mb=""
if [ -r /sys/devices/system/memory/block_size_bytes ]; then
  bloques=$(grep -l online /sys/devices/system/memory/memory*/state 2>/dev/null | wc -l)
  [ "$bloques" -gt 0 ] && ram_mb=$(( 0x$(cat /sys/devices/system/memory/block_size_bytes) * bloques / 1048576 ))
fi
[ -z "$ram_mb" ] && ram_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)

# GPU: the first DRM card with a PCI device (card1-HDMI-A-1 and the like are connectors, not cards).
# The kernel driver and PCI id come from sysfs, which every distro has; the name needs lspci, so the
# server labels the PCI id when the name is missing.
gpu_modelo=""; gpu_pci_id=""; controlador=""; version_controlador=""; vram_mb=""; pci_slot=""
for card in /sys/class/drm/card*; do
  case "$card" in *-*) continue ;; esac
  [ -r "$card/device/uevent" ] || continue
  pci_slot=$(sed -n 's/^PCI_SLOT_NAME=//p' "$card/device/uevent")
  [ -n "$pci_slot" ] || continue
  controlador=$(sed -n 's/^DRIVER=//p' "$card/device/uevent")
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

# VDF files nest blocks (an appmanifest's UserConfig has its own "name"), so a flat grep reads the
# wrong key. Keys are lowercased because old manifests write appID.
vdf_pares() {
  awk '
    function cadena(s,   out, i, c) {
      out = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "\\") { i++; out = out substr(s, i, 1) }
        else if (c == "\"") { resto = substr(s, i + 1); return out }
        else out = out c
      }
      resto = ""; return out
    }
    FNR == 1 { archivo++; d = 0 }
    {
      sub(/^[ \t]+/, ""); sub(/[ \t\r]+$/, "")
      if ($0 == "{") { d++; next }
      if ($0 == "}") { d--; next }
      if (substr($0, 1, 1) != "\"") next
      k = cadena(substr($0, 2)); r = resto; sub(/^[ \t]+/, "", r)
      if (substr(r, 1, 1) != "\"") next
      v = cadena(substr(r, 2)); gsub(/\t/, " ", v)
      print archivo "\t" d "\t" tolower(k) "\t" v
    }' "$@"
}

# Every Steam root (native, Flatpak, Snap) lists its libraries in steamapps/libraryfolders.vdf: "path"
# two levels deep, or a numbered key one level deep in the pre-2021 format.
biblioteca_steam="null"; bibliotecas=()
for raiz in "${OPENGAME_STEAM_DIR:-}" "${HOME:-}/.steam/steam" "${HOME:-}/.local/share/Steam" \
  "${HOME:-}/.var/app/com.valvesoftware.Steam/.local/share/Steam" "${HOME:-}/snap/steam/common/.local/share/Steam"; do
  [ -n "$raiz" ] && [ -d "$raiz/steamapps" ] || continue
  bibliotecas+=("$raiz")
  if [ -r "$raiz/steamapps/libraryfolders.vdf" ]; then
    while IFS= read -r ruta; do bibliotecas+=("$ruta"); done < <(vdf_pares "$raiz/steamapps/libraryfolders.vdf" |
      awk -F'\t' '($2 == 2 && $3 == "path") || ($2 == 1 && $3 ~ /^[0-9]+$/) { print $4 }')
  fi
done
if [ "${#bibliotecas[@]}" -gt 0 ]; then
  manifiestos=()
  while IFS= read -r ruta; do
    for m in "$ruta"/steamapps/appmanifest_*.acf; do [ -f "$m" ] && manifiestos+=("$m"); done
  done < <(for b in "${bibliotecas[@]}"; do realpath -e "$b" 2>/dev/null; done | sort -u)
  biblioteca_steam="[]"
  if [ "${#manifiestos[@]}" -gt 0 ]; then
    # StateFlags 4 is fully installed; 1024 marks an update in progress, which clears bit 4 meanwhile.
    biblioteca_steam=$(vdf_pares "${manifiestos[@]}" | awk -F'\t' '
        $2 == 1 { v[$1, $3] = $4; n = $1 }
        END {
          for (a = 1; a <= n; a++) {
            e = v[a, "stateflags"] + 0
            if (v[a, "appid"] ~ /^[0-9]+$/ && v[a, "name"] != "" && (int(e / 4) % 2 || int(e / 1024) % 2))
              print (v[a, "lastplayed"] + 0) "\t" v[a, "appid"] "\t" v[a, "name"]
          }
        }' | sort -t "$(printf '\t')" -k1,1nr -k2,2n | tr -d '\000-\010\013-\037\177' | sed 's/\\/\\\\/g; s/"/\\"/g' |
      awk -F'\t' -v max="$MAX_JUEGOS" 'BEGIN { printf "[" } max == 0 || NR <= max { printf "%s{\"app_id\":%s,\"nombre\":\"%s\"}", (NR > 1 ? "," : ""), $2 + 0, $3 } END { printf "]" }')
  fi
fi

# Machine facts. Empty means unknown and goes out as null; none of these needs root.
# CPU level: glibc >= 2.33 lists its x86-64 hwcaps levels as "supported" or not. Older glibc lists
# none, so the level stays unknown rather than v1.
nivel_x86=""
if [ "$arquitectura" = x86_64 ] && [ -x /lib64/ld-linux-x86-64.so.2 ]; then
  ldso=$(/lib64/ld-linux-x86-64.so.2 --help 2>/dev/null)
  if printf '%s\n' "$ldso" | grep -q 'x86-64-v2'; then
    nivel_x86=$(printf '%s\n' "$ldso" | sed -n 's/^ *x86-64-\(v[234]\) (supported.*/\1/p' | sort | tail -1)
    [ -n "$nivel_x86" ] || nivel_x86=v1
  fi
fi
# No /sys/firmware/efi: legacy BIOS boot. EFI with an unreadable variable stays unknown. The 5th
# byte of the efivar (after 4 attribute bytes) is the state.
arranque_seguro=""
if [ ! -d /sys/firmware/efi ]; then arranque_seguro=bios
else
  sb=$(od -An -t u1 -j4 -N1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null | tr -d ' ')
  case "$sb" in 1) arranque_seguro=activo ;; 0) arranque_seguro=inactivo ;; esac
fi
# A kernel without the tpm class can't tell; a tpm0 without tpm_version_major (old kernels) neither.
tpm=""
if [ -d /sys/class/tpm/tpm0 ]; then
  case "$(cat /sys/class/tpm/tpm0/tpm_version_major 2>/dev/null)" in 2) tpm="2.0" ;; 1) tpm="1.2" ;; esac
elif [ -d /sys/class/tpm ]; then tpm=no_detectado
fi
# /proc/swaps sizes are KiB: zram devices apart from every other swap (files and partitions).
zram_mb=""; swap_mb=""
if [ -r /proc/swaps ]; then
  read -r zram_mb swap_mb < <(awk 'NR > 1 { if ($1 ~ /^\/dev\/zram/) z += $3; else s += $3 } END { printf "%d %d\n", z / 1024, s / 1024 }' /proc/swaps)
fi

payload="{\"version_esquema\":1,\"capturado_en\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"sistema\":\"Linux\",\"version_sistema\":$(json_str "$version_sistema"),\"distribucion\":{\"nombre\":$(json_str "$distro_nombre"),\"version\":$(json_str "$distro_version")},\"arquitectura\":$(json_str "$arquitectura"),\"cpu_modelo\":$(json_str "$cpu_modelo"),\"gpu_modelo\":$(json_str "$gpu_modelo"),\"gpu_pci_id\":$(json_str "$gpu_pci_id"),\"ram_mb\":$(json_num "$ram_mb"),\"vram_mb\":$(json_num "$vram_mb"),\"controlador\":$(json_str "$controlador"),\"version_controlador\":$(json_str "$version_controlador"),\"soporte_vulkan\":\"$soporte_vulkan\",\"version_vulkan\":$(json_str "$version_vulkan"),\"biblioteca_steam\":$biblioteca_steam,\"nivel_x86\":$(json_str "$nivel_x86"),\"arranque_seguro\":$(json_str "$arranque_seguro"),\"tpm\":$(json_str "$tpm"),\"zram_mb\":$(json_num "$zram_mb"),\"swap_mb\":$(json_num "$swap_mb")}"

if [ "${1:-}" != "--open" ]; then
  printf '%s\n' "$payload"
  echo "Copia el JSON de arriba y pégalo en $APP_URL/diagnostico" >&2
  exit 0
fi

url="$APP_URL/diagnostico/importar#d=$(printf '%s' "$payload" | base64 | tr -d '\n=' | tr '+/' '-_')"
if [ "${#url}" -gt 100000 ]; then # Linux caps one command-line argument at 128 KiB, so xdg-open could not take it
  printf '%s\n' "$payload"
  echo "Tu resultado no cabe en una dirección web. Copia el JSON de arriba y pégalo en $APP_URL/diagnostico" >&2
elif [ "${OPENGAME_DRY:-}" = 1 ]; then
  printf '%s\n' "$url"
elif command -v xdg-open >/dev/null && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  # Some openers wait until the browser exits, so it runs in the background.
  xdg-open "$url" >/dev/null 2>&1 &
  echo "Abriendo OpenGame Linux en tu navegador. Nada se guarda hasta que pulses «Guardar»." >&2
else
  echo "No pudimos abrir el navegador. Abre esta dirección:" >&2
  printf '%s\n' "$url"
fi
