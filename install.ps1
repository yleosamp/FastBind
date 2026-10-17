[CmdletBinding()]
param([string]$PackagePath)
$ErrorActionPreference = 'Stop'
if (-not $PackagePath) {
    $pilhaVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json).version
    $PackagePath = Join-Path (Split-Path -Parent $PSScriptRoot) "dist/FastBind-$pilhaVersion.ccx"
    if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) { & (Join-Path $PSScriptRoot 'build.ps1') }
}
$pilhaPackage = (Resolve-Path -LiteralPath $PackagePath).Path
if ([IO.Path]::GetExtension($pilhaPackage) -ne '.ccx') { throw 'Use o instalador .ccx do FastBind.' }
$pilhaUpia = 'C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
if (-not (Test-Path -LiteralPath $pilhaUpia)) { throw 'Instalador da Adobe nao encontrado. Instale/atualize o Creative Cloud Desktop e abra o .ccx.' }
$pilhaInstallerProcess = Start-Process -FilePath $pilhaUpia -ArgumentList '/install',('"' + $pilhaPackage + '"') -WindowStyle Hidden -Wait -PassThru
if ($pilhaInstallerProcess.ExitCode -ne 0) { throw "A Adobe nao confirmou a instalacao (codigo $($pilhaInstallerProcess.ExitCode)). Abra o .ccx no Creative Cloud para ver os detalhes." }
$pilhaExpectedManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$pilhaInstalledRoots = @(
    (Join-Path $env:CommonProgramFiles 'Adobe/UXP/Plugins/External'),
    (Join-Path $env:APPDATA 'Adobe/UXP/Plugins/External')
)
$pilhaConfirmed = $false
foreach ($pilhaInstalledRoot in $pilhaInstalledRoots) {
    $pilhaInstalledFolder = Join-Path $pilhaInstalledRoot ($pilhaExpectedManifest.id + '_' + $pilhaExpectedManifest.version)
    $pilhaInstalledManifest = Join-Path $pilhaInstalledFolder 'manifest.json'
    if (Test-Path -LiteralPath $pilhaInstalledManifest -PathType Leaf) {
        $pilhaObserved = Get-Content -LiteralPath $pilhaInstalledManifest -Raw | ConvertFrom-Json
        if ($pilhaObserved.id -eq $pilhaExpectedManifest.id -and $pilhaObserved.version -eq $pilhaExpectedManifest.version) { $pilhaConfirmed = $true }
    }
}
if (-not $pilhaConfirmed) { throw 'O instalador terminou, mas nao foi possivel confirmar os arquivos instalados. Confira o Creative Cloud antes de tentar novamente.' }
Write-Host 'FastBind instalado. No Premiere: Janela / Window > Plugins UXP > FastBind.' -ForegroundColor Green
Write-Host 'Nao foi necessario modificar sua timeline nem reiniciar o Premiere automaticamente.'
