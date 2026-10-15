# OpenGame Linux detector for Windows. Reads the hardware and the installed Steam games without admin
# rights and opens the web app with a JSON payload (version 1). Nothing leaves this PC unless you choose to:
#
#   irm <origen>/opengame-detect.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File .\opengame-detect.ps1
#
# The payload travels in the URL fragment (#d=), which the browser never sends to the server. A payload
# too long for a URL goes to the clipboard instead, and the page asks to paste it.
# OPENGAME_URL overrides the app address. OPENGAME_DRY=1 prints the URL instead of opening it,
# OPENGAME_IMPRIMIR=1 prints the JSON. OPENGAME_STEAM_DIR replaces the Steam folder read from the registry.
# OPENGAME_MAX_JUEGOS overrides how many games are sent, which the server fills in like the URL.
#
# Must run on Windows PowerShell 5.1 (the Windows 10 default) as well as PowerShell 7: keep this file
# ASCII (5.1 reads a file without BOM as ANSI) and free of 7-only syntax. A test checks both.
& {
  $ErrorActionPreference = 'SilentlyContinue'
  $AppUrl = '__OPENGAME_URL__'
  if ($env:OPENGAME_URL) { $AppUrl = $env:OPENGAME_URL }
  $MaxJuegos = 0
  $tope = '__OPENGAME_MAX_JUEGOS__'
  if ($env:OPENGAME_MAX_JUEGOS) { $tope = $env:OPENGAME_MAX_JUEGOS }
  if (-not [int]::TryParse($tope, [ref]$MaxJuegos) -or $MaxJuegos -le 0) { $MaxJuegos = [int]::MaxValue }
  # Start-Process opens the URL through ShellExecute, which cuts URLs at about 2048 chars.
  $MaxUrl = 2000

  # JSON by hand: ConvertTo-Json differs between 5.1 and 7.
  function Json-Str($s) {
    if ([string]::IsNullOrEmpty($s)) { return 'null' }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($c in ([string]$s).ToCharArray()) {
      $n = [int]$c
      if ($n -lt 32 -or $n -eq 127) { continue }
      if ($c -eq '"') { [void]$sb.Append('\"') }
      elseif ($c -eq '\') { [void]$sb.Append('\\') }
      elseif ($n -gt 126) { [void]$sb.Append(('\u{0:x4}' -f $n)) }
      else { [void]$sb.Append($c) }
    }
    [void]$sb.Append('"')
    $sb.ToString()
  }
  function Json-Num($n) {
    if ($null -eq $n) { return 'null' }
    [string][int64]$n
  }
  function Leer([scriptblock]$lector) {
    try { & $lector } catch { $null }
  }

  function Get-OgVersionSistema {
    $os = Get-CimInstance Win32_OperatingSystem
    $cv = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $rama = $cv.DisplayVersion
    if (-not $rama) { $rama = $cv.ReleaseId }
    $partes = @((([string]$os.Caption) -replace '^Microsoft\s+', '').Trim(), $rama) | Where-Object { $_ }
    $texto = $partes -join ' '
    if ($os.BuildNumber) { $texto = ($texto + ' (' + $os.BuildNumber + ')').Trim() }
    $texto
  }

  function Get-OgArquitectura {
    $a = $env:PROCESSOR_ARCHITEW6432
    if (-not $a) { $a = $env:PROCESSOR_ARCHITECTURE }
    if (-not $a) { if ([Environment]::Is64BitOperatingSystem) { $a = 'AMD64' } else { $a = 'x86' } }
    switch ($a) {
      'AMD64' { 'x86_64' }
      'ARM64' { 'aarch64' }
      'x86' { 'i686' }
      default { $a }
    }
  }

  function Get-OgCpu {
    ([string](Get-CimInstance Win32_Processor | Select-Object -First 1).Name).Trim()
  }

  # TotalPhysicalMemory is lower and would fail an exact "8 GB" minimum on an 8 GB PC.
  function Get-OgRamMb {
    $total = 0
    foreach ($m in @(Get-CimInstance Win32_PhysicalMemory)) { $total += [double]$m.Capacity }
    if ($total -le 0) { $total = [double](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory }
    if ($total -gt 0) { [math]::Floor($total / 1MB) }
  }

  # Remote and indirect display adapters have no PCI id.
  function Get-OgGpu {
    $registro = @(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\*')
    $marcas = @{ '10de' = 0; '1002' = 1; '8086' = 2 }
    $orden = 0
    $pci = @(foreach ($v in @(Get-CimInstance Win32_VideoController)) {
      if ([string]$v.PNPDeviceID -match '^PCI\\VEN_([0-9A-F]{4})&DEV_([0-9A-F]{4})') {
        $ven = $Matches[1].ToLower()
        $dev = $Matches[2].ToLower()
        $marca = $marcas[$ven]
        if ($null -eq $marca) { $marca = 3 }
        New-Object PSObject -Property @{ Ven = $ven; Dev = $dev; Cim = $v; Vram = (Get-OgVram $ven $dev $v $registro); Marca = $marca; Orden = $orden }
        $orden++
      }
    })
    if ($pci.Count -eq 0) { return $null }
    $criterio = @{ Expression = { if ($null -eq $_.Vram) { -1 } else { $_.Vram } }; Descending = $true }, 'Marca', 'Orden'
    $g = @($pci | Sort-Object $criterio)[0]

    # Without a driver Windows names it "Microsoft Basic Display Adapter".
    $modelo = ([string]$g.Cim.Name).Trim()
    if ($modelo -match 'Basic Display') { $modelo = $null }

    @{ Modelo = $modelo; Pci = $g.Ven + ':' + $g.Dev; Vram = $g.Vram }
  }

  # The display class key holds the real size as a qword and needs no admin. AdapterRAM is a uint32
  # that saturates just under 4 GiB, so it only stands in below that.
  function Get-OgVram($ven, $dev, $cim, $registro) {
    foreach ($k in $registro) {
      if ([string]$k.MatchingDeviceId -match ('^pci\\ven_' + $ven + '&dev_' + $dev)) {
        $qw = $k.'HardwareInformation.qwMemorySize'
        if ($qw -is [ValueType] -and $qw -gt 0) { return [math]::Floor([double]$qw / 1MB) }
        break
      }
    }
    $ar = [double]$cim.AdapterRAM
    if ($ar -gt 0 -and $ar -lt (4GB - 1MB)) { [math]::Floor($ar / 1MB) }
  }

  # VDF files nest blocks (an appmanifest's UserConfig has its own "name"), so a flat regex reads the
  # wrong key. Keys are lowercased because old manifests write appID.
  function Get-OgVdfPares([string]$ruta) {
    $d = 0
    foreach ($l in [IO.File]::ReadAllLines($ruta, [Text.Encoding]::UTF8)) {
      $t = $l.Trim()
      if ($t -eq '{') { $d++ }
      elseif ($t -eq '}') { $d-- }
      elseif ($t -match '^"((?:[^"\\]|\\.)*)"\s*"((?:[^"\\]|\\.)*)"') {
        New-Object PSObject -Property @{
          D = $d
          K = ($Matches[1] -replace '\\(.)', '$1').ToLower()
          V = ($Matches[2] -replace '\\(.)', '$1').Replace("`t", ' ')
        }
      }
    }
  }

  # libraryfolders.vdf lists the libraries: "path" two levels deep, or a numbered key one level deep in
  # the pre-2021 format.
  function Get-OgBibliotecaJson {
    $steam = $env:OPENGAME_STEAM_DIR
    if (-not $steam) { $steam = (Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam').SteamPath }
    if (-not $steam -or -not [IO.Directory]::Exists([IO.Path]::Combine($steam, 'steamapps'))) { return 'null' }

    $rutas = New-Object System.Collections.ArrayList
    [void]$rutas.Add($steam)
    $vdf = [IO.Path]::Combine($steam, 'steamapps', 'libraryfolders.vdf')
    if ([IO.File]::Exists($vdf)) {
      foreach ($p in @(Get-OgVdfPares $vdf)) {
        if (($p.D -eq 2 -and $p.K -eq 'path') -or ($p.D -eq 1 -and $p.K -match '^[0-9]+$')) { [void]$rutas.Add($p.V) }
      }
    }

    $vistas = @{}
    $juegos = foreach ($r in $rutas) {
      $apps = [IO.Path]::GetFullPath([IO.Path]::Combine($r, 'steamapps'))
      if ($vistas.ContainsKey($apps) -or -not [IO.Directory]::Exists($apps)) { continue }
      $vistas[$apps] = $true
      foreach ($m in [IO.Directory]::GetFiles($apps, 'appmanifest_*.acf')) {
        $v = @{}
        foreach ($p in @(Get-OgVdfPares $m)) { if ($p.D -eq 1) { $v[$p.K] = $p.V } }
        [int64]$estado = 0
        [void][int64]::TryParse([string]$v['stateflags'], [ref]$estado)
        # StateFlags 4 is fully installed; 1024 marks an update in progress, which clears bit 4 meanwhile.
        if ([string]$v['appid'] -match '^[0-9]+$' -and $v['name'] -and ($estado -band 1028) -ne 0) {
          [int64]$ultima = 0
          [void][int64]::TryParse([string]$v['lastplayed'], [ref]$ultima)
          New-Object PSObject -Property @{ AppId = [int64]$v['appid']; Nombre = [string]$v['name']; Ultima = $ultima }
        }
      }
    }

    $orden = @{ Expression = 'Ultima'; Descending = $true }, @{ Expression = 'AppId'; Descending = $false }
    $items = foreach ($j in @($juegos | Sort-Object $orden | Select-Object -First $MaxJuegos)) {
      '{"app_id":' + $j.AppId + ',"nombre":' + (Json-Str $j.Nombre) + '}'
    }
    '[' + (@($items) -join ',') + ']'
  }

  $gpu = Leer { Get-OgGpu }
  if (-not $gpu) { $gpu = @{ Modelo = $null; Pci = $null; Vram = $null } }
  $biblioteca = Leer { Get-OgBibliotecaJson }
  if (-not $biblioteca) { $biblioteca = 'null' }
  $ahora = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [Globalization.CultureInfo]::InvariantCulture)

  $json = '{"version_esquema":1' +
    ',"capturado_en":' + (Json-Str $ahora) +
    ',"sistema":"Windows"' +
    ',"version_sistema":' + (Json-Str (Leer { Get-OgVersionSistema })) +
    ',"arquitectura":' + (Json-Str (Leer { Get-OgArquitectura })) +
    ',"cpu_modelo":' + (Json-Str (Leer { Get-OgCpu })) +
    ',"gpu_modelo":' + (Json-Str $gpu.Modelo) +
    ',"gpu_pci_id":' + (Json-Str $gpu.Pci) +
    ',"ram_mb":' + (Json-Num (Leer { Get-OgRamMb })) +
    ',"vram_mb":' + (Json-Num $gpu.Vram) +
    ',"biblioteca_steam":' + $biblioteca + '}'

  if ($env:OPENGAME_IMPRIMIR -eq '1') { return $json }
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $url = $AppUrl + '/diagnostico/importar#d=' + $b64
  if ($env:OPENGAME_DRY -eq '1') { return $url }

  if ($url.Length -le $MaxUrl) {
    Start-Process $url
    Write-Host 'Abriendo OpenGame Linux en tu navegador. Nada se guarda hasta que pulses Guardar.'
  }
  else {
    Set-Clipboard -Value $json
    Start-Process ($AppUrl + '/diagnostico?pegar=1')
    Write-Host 'Tu resultado no cabe en una direccion web, asi que lo copiamos al portapapeles.'
    Write-Host 'Pegalo con Ctrl+V en la pagina que se acaba de abrir. Nada se guarda hasta que pulses Guardar.'
  }
}
