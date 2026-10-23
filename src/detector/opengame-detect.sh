#!/usr/bin/env bash
# OpenGame Linux detector. Reads the hardware without root and prints a JSON payload (version 1)
# shaped like the `diagnostic` table. Nothing leaves this computer unless you choose to:
#
#   bash opengame-detect.sh                  prints the JSON to paste in the web app
#   bash opengame-detect.sh --open           opens the web app with the payload in the URL fragment (#d=),
#                                            which the browser never sends to the server
#   bash opengame-detect.sh --game <appid>   like --open, plus what Steam runs that game with (compatibility
#                                            tool and its exact version, launch options, build), so the
#                                            app can prefill a report of it
#
# OPENGAME_DRY=1 with --open or --game prints the URL instead of opening a browser. OPENGAME_URL overrides the
# app address. OPENGAME_STEAM_DIR adds a Steam folder to the ones searched for installed games. OPENGAME_MAX_JUEGOS
# overrides how many games are sent, and OPENGAME_LANG the language (es or en) it speaks and opens the app in; the
# server fills both in like the URL, the language from the script's own address (?lang=en). OPENGAME_DRM, OPENGAME_DMI
# and OPENGAME_OS_RELEASE replace /sys/class/drm, /sys/class/dmi/id and /etc/os-release, so tests can describe a machine.
set -u

lang="${OPENGAME_LANG:-__OPENGAME_LANG__}"
[ "$lang" = en ] || lang=es
# say <Spanish> <English>: one line for the person running it, on stderr, in their language.
say() { if [ "$lang" = en ]; then printf '%s\n' "$2" >&2; else printf '%s\n' "$1" >&2; fi; }

open=""; game=""
while [ $# -gt 0 ]; do
  case "$1" in
    --open) open=1 ;;
    --game)
      case "${2:-}" in ''|*[!0-9]*|???????????*) game=0 ;; *) game=$((10#$2)) ;; esac
      if [ "$game" -eq 0 ]; then
        say "Uso: --game <appid>, el número del juego en Steam (por ejemplo --game 1245620)" "Usage: --game <appid>, the game's number on Steam (for example --game 1245620)"
        exit 2
      fi
      open=1; shift ;;
  esac
  shift
done

APP_URL="${OPENGAME_URL:-__OPENGAME_URL__}"
MAX_GAMES="${OPENGAME_MAX_JUEGOS:-__OPENGAME_MAX_JUEGOS__}"
case "$MAX_GAMES" in ''|*[!0-9]*) MAX_GAMES=0 ;; esac

json_str() {
  if [ -z "${1:-}" ]; then printf 'null'; else
    printf '"%s"' "$(printf '%s' "$1" | tr '\t' ' ' | tr -d '\000-\037\177' | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
}
json_num() { # a JSON integer, or null for anything else (nvidia-smi prints "[N/A]")
  case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac
}

architecture=$(uname -m)
os_version=$(uname -r)
os_release="${OPENGAME_OS_RELEASE:-/etc/os-release}"
distro_name=$(. "$os_release" 2>/dev/null; printf '%s' "${NAME:-}")
distro_version=$(. "$os_release" 2>/dev/null; printf '%s' "${VERSION_ID:-}")
# SteamOS is told by its ID; NAME is free text.
[ "$(. "$os_release" 2>/dev/null; printf '%s' "${ID:-}")" = steamos ] && distro_name=SteamOS
# A Steam Deck names its model in DMI: Jupiter is the LCD one, Galileo the OLED one.
device=""
dmi="${OPENGAME_DMI:-/sys/class/dmi/id}"
case "$(cat "$dmi/sys_vendor" 2>/dev/null)" in
  Valve*) case "$(cat "$dmi/product_name" 2>/dev/null)" in Jupiter) device=steam_deck_lcd ;; Galileo) device=steam_deck_oled ;; esac ;;
esac
# x86 names the CPU in /proc/cpuinfo; ARM kernels often do not, while lscpu still does.
cpu_model=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')
[ -z "$cpu_model" ] && command -v lscpu >/dev/null && cpu_model=$(lscpu 2>/dev/null | sed -n 's/^Model name: *//p' | head -1)
[ -z "$cpu_model" ] && cpu_model=$(grep -m1 '^Hardware' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//')

# Installed RAM from online memory blocks (16384 on a 16 GB machine). MemTotal is lower (kernel and
# iGPU reservations) and would fail an exact "8 GB" minimum on an 8 GB laptop.
ram_mb=""
if [ -r /sys/devices/system/memory/block_size_bytes ]; then
  blocks=$(grep -l online /sys/devices/system/memory/memory*/state 2>/dev/null | wc -l)
  [ "$blocks" -gt 0 ] && ram_mb=$(( 0x$(cat /sys/devices/system/memory/block_size_bytes) * blocks / 1048576 ))
fi
[ -z "$ram_mb" ] && ram_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)

# GPU: the DRM card games run on, picked as the Windows detector does: most VRAM, then NVIDIA, AMD,
# Intel, then the first card. A hybrid laptop lists its iGPU first, an iGPU counts as 0 VRAM, and
# nouveau reports none, so the brand decides there.
# card1-HDMI-A-1 and the like are connectors, not cards. The kernel driver and PCI id come from sysfs, which every distro
# has; the name needs lspci, so the server labels the PCI id when the name is missing.
nvidia_smi=""
command -v nvidia-smi >/dev/null && nvidia_smi=$(nvidia-smi --query-gpu=pci.bus_id,memory.total,name --format=csv,noheader,nounits 2>/dev/null)
gpu_model=""; gpu_pci_id=""; gpu_driver=""; driver_version=""; vram_mb=""; pci_slot=""; best_score=-1
for card in "${OPENGAME_DRM:-/sys/class/drm}"/card*; do
  case "${card##*/}" in *-*) continue ;; esac
  [ -r "$card/device/uevent" ] || continue
  slot=$(sed -n 's/^PCI_SLOT_NAME=//p' "$card/device/uevent")
  [ -n "$slot" ] || continue
  driver=$(sed -n 's/^DRIVER=//p' "$card/device/uevent")
  pci_id=$(sed -n 's/^PCI_ID=//p' "$card/device/uevent" | tr 'A-F' 'a-f')
  vram=""; name=""
  if [ -r "$card/device/mem_info_vram_total" ]; then # amdgpu
    vram=$(( $(cat "$card/device/mem_info_vram_total") / 1048576 ))
  elif [ "$driver" = nvidia ]; then # nvidia-smi writes the bus as 00000000:01:00.0, sysfs as 0000:01:00.0
    row=$(printf '%s\n' "$nvidia_smi" | awk -F', ' -v bus="${slot#*:}" 'tolower(substr($1, index($1, ":") + 1)) == bus { print; exit }')
    vram=$(printf '%s' "$row" | cut -d, -f2 | tr -d ' ')
    name=$(printf '%s' "$row" | cut -d, -f3- | sed 's/^ *//')
  fi
  score=$vram; case "$score" in ''|*[!0-9]*) score=0 ;; esac # nvidia-smi prints "[N/A]" on some cards
  case "$pci_id" in 10de:*) brand=3 ;; 1002:*) brand=2 ;; 8086:*) brand=1 ;; *) brand=0 ;; esac
  score=$(( score * 4 + brand ))
  [ "$score" -gt "$best_score" ] || continue
  best_score=$score; pci_slot=$slot; gpu_driver=$driver; vram_mb=$vram; gpu_model=$name; gpu_pci_id=$pci_id
done
if [ -z "$gpu_model" ] && command -v lspci >/dev/null && [ -n "$pci_slot" ]; then
  gpu_model=$(lspci -mm -s "$pci_slot" 2>/dev/null | awk -F'"' '{print $4" "$6}')
fi
if [ "$gpu_driver" = "nvidia" ]; then
  driver_version=$(sed -n 's/.*Kernel Module *\([0-9.]*\).*/\1/p' /proc/driver/nvidia/version 2>/dev/null | head -1)
else
  driver_version=$( (dpkg-query -W -f='${Version}' libgl1-mesa-dri 2>/dev/null || rpm -q --qf '%{VERSION}' mesa-dri-drivers 2>/dev/null || pacman -Q mesa 2>/dev/null | awk '{print $2}') | head -1)
  [ -n "$driver_version" ] && driver_version="Mesa $driver_version"
fi

# Vulkan: only vulkaninfo proves support. Mesa installs ICD manifests for GPU families the machine
# may not have, so without a working vulkaninfo support stays `desconocido` with no version. The
# version is the chosen card's, matched by vendor:device: the list can lead with another GPU or with
# llvmpipe, a CPU renderer that is no GPU support. With no PCI card (Arm boards) the first GPU device
# counts. Older vulkaninfo writes apiVersion as "4206847 (1.3.255)".
vulkan_support="desconocido"; vulkan_version=""
if vulkan=$(vulkaninfo --summary 2>/dev/null); then
  vulkan_version=$(printf '%s\n' "$vulkan" | awk -F' *= *' -v id="$gpu_pci_id" '
    function hex4(x) { sub(/^0x/, "", x); sub(/[ \t\r].*/, "", x); x = tolower(x); while (length(x) < 4) x = "0" x; return x }
    function flush() {
      if (!found && ven != "" && type !~ /CPU/ && (id == "" || ven ":" dev == id)) { print api; found = 1 }
      ven = dev = api = type = ""
    }
    /^GPU[0-9]+:/ { flush() }
    { key = $1; gsub(/[ \t]/, "", key) }
    key == "apiVersion" { api = $2; sub(/^[0-9]+ *\(/, "", api); sub(/[^0-9.].*/, "", api) }
    key == "vendorID" { ven = hex4($2) }
    key == "deviceID" { dev = hex4($2) }
    key == "deviceType" { type = $2 }
    END { flush() }')
  if [ -n "$vulkan_version" ]; then vulkan_support="si"; else vulkan_support="no"; fi
fi

# Prints each "key" "value" pair of VDF files as file<TAB>path<TAB>value, where the path joins the keys of the
# enclosing blocks with "/" (appstate/name, libraryfolders/0/path). Blocks nest (an appmanifest's UserConfig
# has its own "name"), so a flat grep reads the wrong key. Keys are lowercased because old manifests write appID.
vdf_pairs() {
  awk '
    function unquote(s,   out, i, c) {
      out = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "\\") { i++; out = out substr(s, i, 1) }
        else if (c == "\"") { rest = substr(s, i + 1); return out }
        else out = out c
      }
      rest = ""; return out
    }
    FNR == 1 { d = 0 }
    {
      sub(/^[ \t]+/, ""); sub(/[ \t\r]+$/, "")
      if ($0 == "{") { path[++d] = block; next }
      if ($0 == "}") { d--; next }
      if (substr($0, 1, 1) != "\"") next
      k = tolower(unquote(substr($0, 2))); r = rest; sub(/^[ \t]+/, "", r)
      if (substr(r, 1, 1) != "\"") { block = k; next }
      v = unquote(substr(r, 2)); gsub(/\t/, " ", v)
      p = ""; for (i = 1; i <= d; i++) p = p path[i] "/"
      print FILENAME "\t" p k "\t" v
    }' "$@"
}

# Every Steam root (native, Flatpak, Snap) lists its libraries in steamapps/libraryfolders.vdf: "path"
# two levels deep, or a numbered key one level deep in the pre-2021 format.
steam_library="null"; roots=(); libraries=(); manifests=()
for root in "${OPENGAME_STEAM_DIR:-}" "${HOME:-}/.steam/steam" "${HOME:-}/.local/share/Steam" \
  "${HOME:-}/.var/app/com.valvesoftware.Steam/.local/share/Steam" "${HOME:-}/snap/steam/common/.local/share/Steam"; do
  [ -n "$root" ] && [ -d "$root/steamapps" ] || continue
  roots+=("$root")
  libraries+=("$root")
  if [ -r "$root/steamapps/libraryfolders.vdf" ]; then
    while IFS= read -r library; do libraries+=("$library"); done < <(vdf_pairs "$root/steamapps/libraryfolders.vdf" |
      awk -F'\t' '$2 ~ /^[^\/]+\/[^\/]+\/path$/ || $2 ~ /^[^\/]+\/[0-9]+$/ { print $3 }')
  fi
done
if [ "${#libraries[@]}" -gt 0 ]; then
  while IFS= read -r library; do
    for m in "$library"/steamapps/appmanifest_*.acf; do [ -f "$m" ] && manifests+=("$m"); done
  done < <(for b in "${libraries[@]}"; do realpath -e "$b" 2>/dev/null; done | sort -u)
  steam_library="[]"
  if [ "${#manifests[@]}" -gt 0 ]; then
    # StateFlags 4 is fully installed; 1024 marks an update in progress, which clears bit 4 meanwhile.
    steam_library=$(vdf_pairs "${manifests[@]}" | awk -F'\t' '
        split($2, p, "/") == 2 { v[$1, p[2]] = $3; files[$1] = 1 }
        END {
          for (a in files) {
            e = v[a, "stateflags"] + 0
            if (v[a, "appid"] ~ /^[0-9]+$/ && v[a, "name"] != "" && (int(e / 4) % 2 || int(e / 1024) % 2))
              print (v[a, "lastplayed"] + 0) "\t" v[a, "appid"] "\t" v[a, "name"]
          }
        }' | sort -t "$(printf '\t')" -k1,1nr -k2,2n | tr -d '\000-\010\013-\037\177' | sed 's/\\/\\\\/g; s/"/\\"/g' |
      awk -F'\t' -v max="$MAX_GAMES" 'BEGIN { printf "[" } max == 0 || NR <= max { printf "%s{\"app_id\":%s,\"nombre\":\"%s\"}", (NR > 1 ? "," : ""), $2 + 0, $3 } END { printf "]" }')
  fi
fi

# Report mode (--game): what Steam runs that game with. Proton writes the build that last ran the game into its
# prefix, compatdata/<appid>/config_info (line 2 is that build's fonts folder), and every build carries a version
# file that names its exact release ("1718385733 proton-9.0-2"). Without one, config/config.vdf says which tool
# applies: the game's own entry, else the default under "0", which Steam gives only to Windows titles, so an
# installed game Proton never ran is native. Launch options live per account in
# userdata/<account>/config/localconfig.vdf, the build in the appmanifest.
game_block="null"
if [ -n "$game" ]; then
  manifest=""; for m in "${manifests[@]}"; do case "$m" in */appmanifest_"$game".acf) manifest=$m ;; esac; done
  [ -n "$manifest" ] || say "No encontramos el juego $game instalado en Steam; enviamos solo lo que guarda su configuración." \
    "We couldn't find game $game installed on Steam; we're sending only what its settings keep."
  build=""; prefix=""
  if [ -n "$manifest" ]; then
    build=$(vdf_pairs "$manifest" | awk -F'\t' '$2 == "appstate/buildid" { print $3; exit }')
    prefix="${manifest%/*}/compatdata/$game"
  fi
  root=""; for r in "${roots[@]}"; do [ -r "$r/config/config.vdf" ] && { root=$r; break; }; done
  tool=""; version_file=""; native=false; launch_options=""; guessed=false
  if [ -n "$prefix" ] && [ -r "$prefix/config_info" ]; then
    ran=$(sed -n 2p "$prefix/config_info" | sed -E 's#/(files|dist)/share/fonts/?$##')
    [ -r "$ran/version" ] && { tool=${ran##*/}; version_file="$ran/version"; }
  fi
  if [ -z "$tool" ] && [ -n "$root" ]; then
    mapping=$(vdf_pairs "$root/config/config.vdf" | awk -F'\t' '$2 ~ /\/compattoolmapping\/[0-9]+\/name$/ { n = split($2, p, "/"); print p[n - 1] "\t" $3 }')
    tool=$(printf '%s\n' "$mapping" | awk -F'\t' -v id="$game" '$1 == id { print $2; exit }')
    [ -z "$tool" ] && [ -d "$prefix" ] && tool=$(printf '%s\n' "$mapping" | awk -F'\t' '$1 == "0" { print $2; exit }')
  fi
  [ -z "$tool" ] && [ -n "$manifest" ] && [ ! -d "$prefix" ] && native=true
  if [ -n "$tool" ] && [ -z "$version_file" ]; then
    # A custom tool sits in compatibilitytools.d under its name. Valve's are Steam apps: "Proton 9.0" is
    # proton_9, "Proton 5.13" proton_513, "Proton - Experimental" proton_experimental.
    for r in "${roots[@]}"; do [ -r "$r/compatibilitytools.d/$tool/version" ] && { version_file="$r/compatibilitytools.d/$tool/version"; break; }; done
    if [ -z "$version_file" ] && [ "${#manifests[@]}" -gt 0 ]; then
      version_file=$(vdf_pairs "${manifests[@]}" | awk -F'\t' -v want="$tool" '
        function tool(s,   n, p) {
          n = tolower(s); sub(/^proton[ -]+/, "", n)
          if (n ~ /^[0-9]+\.[0-9]+$/) { split(n, p, "."); return "proton_" p[1] (p[2] == "0" ? "" : p[2]) }
          gsub(/[^a-z0-9]+/, "_", n); return "proton_" n
        }
        $2 == "appstate/name" && tolower($3) ~ /^proton[ -]/ { name[$1] = tool($3) }
        $2 == "appstate/installdir" { dir[$1] = $3 }
        END { for (f in name) if (name[f] == want && dir[f] != "") { d = dir[f]; sub(/\/[^\/]*$/, "", f); print f "/common/" d "/version"; exit } }')
    fi
  fi
  tool_version=""; [ -r "$version_file" ] && tool_version=$(head -n 1 "$version_file" | sed 's/^[0-9]* //; s/[[:space:]]*$//')
  if [ -n "$root" ]; then
    # The account that signed in last (MostRecent in loginusers.vdf), else the only one. With several and none
    # marked, the first, and the payload says so.
    config=""; accounts=()
    for c in "$root"/userdata/*/config/localconfig.vdf; do [ -f "$c" ] && accounts+=("$c"); done
    recent=$(vdf_pairs "$root/config/loginusers.vdf" 2>/dev/null | awk -F'\t' '$2 ~ /^users\/[0-9]+\/mostrecent$/ && $3 == "1" { split($2, p, "/"); print p[2] }')
    case "$recent" in ''|*[!0-9]*) ;; *) config="$root/userdata/$((recent - 76561197960265728))/config/localconfig.vdf" ;; esac
    if [ ! -f "$config" ] && [ "${#accounts[@]}" -gt 0 ]; then
      config=${accounts[0]}
      [ "${#accounts[@]}" -gt 1 ] && guessed=true
    fi
    [ -f "$config" ] && launch_options=$(vdf_pairs "$config" | awk -F'\t' -v id="$game" '$2 ~ ("/apps/" id "/launchoptions$") { print $3; exit }')
  fi
  game_block="{\"app_id\":$game,\"herramienta\":$(json_str "$tool"),\"version_herramienta\":$(json_str "$tool_version"),\"opciones_lanzamiento\":$(json_str "$launch_options"),\"build\":$(json_str "$build"),\"nativo\":$native,\"cuenta_supuesta\":$guessed}"
fi

# Machine facts. Empty means unknown and goes out as null; none of these needs root.
# CPU level: glibc >= 2.33 lists its x86-64 hwcaps levels as "supported" or not. Older glibc lists
# none, so the level stays unknown rather than v1.
x86_level=""
if [ "$architecture" = x86_64 ] && [ -x /lib64/ld-linux-x86-64.so.2 ]; then
  ldso=$(/lib64/ld-linux-x86-64.so.2 --help 2>/dev/null)
  if printf '%s\n' "$ldso" | grep -q 'x86-64-v2'; then
    x86_level=$(printf '%s\n' "$ldso" | sed -n 's/^ *x86-64-\(v[234]\) (supported.*/\1/p' | sort | tail -1)
    [ -n "$x86_level" ] || x86_level=v1
  fi
fi
# No /sys/firmware/efi: legacy BIOS boot. EFI with an unreadable variable stays unknown. The 5th
# byte of the efivar (after 4 attribute bytes) is the state.
secure_boot=""
if [ ! -d /sys/firmware/efi ]; then secure_boot=bios
else
  sb=$(od -An -t u1 -j4 -N1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null | tr -d ' ')
  case "$sb" in 1) secure_boot=activo ;; 0) secure_boot=inactivo ;; esac
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

payload="{\"version_esquema\":1,\"capturado_en\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"sistema\":\"Linux\",\"version_sistema\":$(json_str "$os_version"),\"distribucion\":{\"nombre\":$(json_str "$distro_name"),\"version\":$(json_str "$distro_version")},\"arquitectura\":$(json_str "$architecture"),\"cpu_modelo\":$(json_str "$cpu_model"),\"gpu_modelo\":$(json_str "$gpu_model"),\"gpu_pci_id\":$(json_str "$gpu_pci_id"),\"ram_mb\":$(json_num "$ram_mb"),\"vram_mb\":$(json_num "$vram_mb"),\"controlador\":$(json_str "$gpu_driver"),\"version_controlador\":$(json_str "$driver_version"),\"soporte_vulkan\":\"$vulkan_support\",\"version_vulkan\":$(json_str "$vulkan_version"),\"biblioteca_steam\":$steam_library,\"nivel_x86\":$(json_str "$x86_level"),\"arranque_seguro\":$(json_str "$secure_boot"),\"tpm\":$(json_str "$tpm"),\"zram_mb\":$(json_num "$zram_mb"),\"swap_mb\":$(json_num "$swap_mb"),\"dispositivo\":$(json_str "$device"),\"juego\":$game_block}"

if [ -z "$open" ]; then
  printf '%s\n' "$payload"
  say "Copia el JSON de arriba y pégalo en $APP_URL/$lang/diagnostico" "Copy the JSON above and paste it at $APP_URL/$lang/diagnostico"
  exit 0
fi

url="$APP_URL/$lang/diagnostico/importar#d=$(printf '%s' "$payload" | base64 | tr -d '\n=' | tr '+/' '-_')"
if [ "${#url}" -gt 100000 ]; then # Linux caps one command-line argument at 128 KiB, so xdg-open could not take it
  printf '%s\n' "$payload"
  say "Tu resultado no cabe en una dirección web. Copia el JSON de arriba y pégalo en $APP_URL/$lang/diagnostico" \
    "Your result doesn't fit in a web address. Copy the JSON above and paste it at $APP_URL/$lang/diagnostico"
elif [ "${OPENGAME_DRY:-}" = 1 ]; then
  printf '%s\n' "$url"
elif command -v xdg-open >/dev/null && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  # Some openers wait until the browser exits, so it runs in the background.
  xdg-open "$url" >/dev/null 2>&1 &
  say "Abriendo OpenGame Linux en tu navegador. Nada se guarda hasta que pulses «Guardar»." "Opening OpenGame Linux in your browser. Nothing is saved until you press “Save”."
else
  say "No pudimos abrir el navegador. Abre esta dirección:" "We couldn't open your browser. Open this address:"
  printf '%s\n' "$url"
fi
