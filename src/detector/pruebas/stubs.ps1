# Test doubles for opengame-detect.ps1 (never served). Dot-source this file before running the script:
# a function shadows the cmdlet of the same name, so the real script reads this fake Windows PC.
#   default                         laptop with Intel HD 4600 + GeForce GTX 750 Ti (2 GiB), 2 x 4 GiB RAM,
#                                   Windows 10 22H2, Steam at $env:OPENGAME_PRUEBA_STEAM
#   OPENGAME_PRUEBA_EQUIPO=basico   Windows 11 23H2 without a GPU driver, no RAM modules listed, no Steam
# Start-Process and Set-Clipboard append "<cmdlet> <argument>" lines to $env:OPENGAME_PRUEBA_REGISTRO.
$basico = $env:OPENGAME_PRUEBA_EQUIPO -eq 'basico'

function Get-CimInstance([string]$ClassName) {
  switch ($ClassName) {
    'Win32_OperatingSystem' {
      if ($basico) { [pscustomobject]@{ Caption = 'Microsoft Windows 11 Pro'; BuildNumber = '22631' } }
      else { [pscustomobject]@{ Caption = 'Microsoft Windows 10 Home'; BuildNumber = '19045' } }
    }
    'Win32_Processor' { [pscustomobject]@{ Name = 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz   ' } }
    'Win32_PhysicalMemory' {
      if (-not $basico) { [pscustomobject]@{ Capacity = [uint64]4GB }; [pscustomobject]@{ Capacity = [uint64]4GB } }
    }
    'Win32_ComputerSystem' { [pscustomobject]@{ TotalPhysicalMemory = [uint64]8471236608 } }
    'Win32_VideoController' {
      [pscustomobject]@{ Name = 'Microsoft Remote Display Adapter'; PNPDeviceID = 'SWD\REMOTEDISPLAYENUM\RDPIDD_INDIRECTDISPLAY&SESSIONID_0001'; AdapterRAM = $null }
      if ($basico) {
        [pscustomobject]@{ Name = 'Microsoft Basic Display Adapter'; PNPDeviceID = 'PCI\VEN_10DE&DEV_1380&SUBSYS_362D1458&REV_A2\4&2B0A7B8C&0&0008'; AdapterRAM = 0 }
      }
      else {
        [pscustomobject]@{ Name = 'Intel(R) HD Graphics 4600'; PNPDeviceID = 'PCI\VEN_8086&DEV_0412&SUBSYS_05CA1028&REV_06\3&11583659&0&10'; AdapterRAM = [uint32]1073741824 }
        # AdapterRAM saturates as a uint32, so the 2 GiB the script reports can only come from qwMemorySize.
        [pscustomobject]@{ Name = 'NVIDIA GeForce GTX 750 Ti'; PNPDeviceID = 'PCI\VEN_10DE&DEV_1380&SUBSYS_362D1458&REV_A2\4&2B0A7B8C&0&0008'; AdapterRAM = [uint32]4293918720 }
      }
    }
  }
}

function Get-ItemProperty([string]$Path) {
  switch ($Path) {
    'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' {
      if ($basico) { [pscustomobject]@{ DisplayVersion = '23H2'; ReleaseId = '2009' } }
      else { [pscustomobject]@{ DisplayVersion = '22H2'; ReleaseId = '2009' } }
    }
    'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\*' {
      if ($basico) { [pscustomobject]@{ MatchingDeviceId = 'PCI\CC_0300'; DriverDesc = 'Microsoft Basic Display Adapter' } }
      else {
        [pscustomobject]@{ MatchingDeviceId = 'pci\ven_8086&dev_0412'; DriverDesc = 'Intel(R) HD Graphics 4600' }
        [pscustomobject]@{ MatchingDeviceId = 'pci\ven_10de&dev_1380'; DriverDesc = 'NVIDIA GeForce GTX 750 Ti'; 'HardwareInformation.qwMemorySize' = [int64]2147483648 }
      }
    }
    'HKCU:\Software\Valve\Steam' {
      if (-not $basico) { [pscustomobject]@{ SteamPath = $env:OPENGAME_PRUEBA_STEAM } }
    }
  }
}

function Start-Process([string]$FilePath) { Add-Content -LiteralPath $env:OPENGAME_PRUEBA_REGISTRO -Value ('Start-Process ' + $FilePath) }
function Set-Clipboard([string]$Value) { Add-Content -LiteralPath $env:OPENGAME_PRUEBA_REGISTRO -Value ('Set-Clipboard ' + $Value) }
