[CmdletBinding()]
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$pilhaSource = $PSScriptRoot
$pilhaDist = Join-Path (Split-Path -Parent $pilhaSource) 'dist'
$pilhaManifest = Get-Content -LiteralPath (Join-Path $pilhaSource 'manifest.json') -Raw | ConvertFrom-Json
# FastBind continues the existing Pilha installation. A display-name change must
# not silently create a second plugin identity or detach the saved library.
if ($pilhaManifest.id -ne 'com.leoda.pilha.premiere' -or $pilhaManifest.entrypoints[0].id -ne 'pilhaPanel') { throw 'A identidade existente do plugin/painel deve ser preservada nesta atualizacao.' }
New-Item -ItemType Directory -Path $pilhaDist -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pilhaRuntimeFiles = @('manifest.json','index.html','styles.css','main.js','core.js','host.js','library.js','view.js','locale.js','updates.js','LICENSE')
$pilhaRuntimeFiles += @(Get-ChildItem -LiteralPath (Join-Path $pilhaSource 'icons') -File | ForEach-Object { 'icons/' + $_.Name })
$pilhaCcx = Join-Path $pilhaDist "FastBind-$($pilhaManifest.version).ccx"
$pilhaZip = Join-Path $pilhaDist "FastBind-$($pilhaManifest.version)-codigo.zip"
$pilhaSourceFiles = @($pilhaRuntimeFiles) + @('package.json','README.md','CHANGELOG.md','.gitignore','docs/PRIVACY.md','docs/images/fastbind.png','.github/workflows/ci.yml','build.ps1','install.ps1','INSTALAR.bat')
$pilhaSourceFiles += @(Get-ChildItem -LiteralPath (Join-Path $pilhaSource 'tests') -File | ForEach-Object { 'tests/' + $_.Name })
$pilhaSourceFiles += @(Get-ChildItem -LiteralPath (Join-Path $pilhaSource 'tools') -File | ForEach-Object { 'tools/' + $_.Name })
foreach ($relative in $pilhaSourceFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $pilhaSource $relative) -PathType Leaf)) { throw "Arquivo necessario ausente: $relative" }
}
foreach ($destination in @($pilhaCcx,$pilhaZip)) {
    if ((Test-Path -LiteralPath $destination) -and -not $Force) { throw "Pacote existente: $destination. Use -Force para reconstruir os artefatos gerados." }
}
Push-Location -LiteralPath $pilhaSource
try {
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'A verificacao de sintaxe falhou.' }
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Os testes falharam; nenhum pacote foi gerado.' }
} finally { Pop-Location }
function Write-PilhaArchive([string]$Destination, [string[]]$Files, [string]$Prefix) {
    $stream = [IO.File]::Open($Destination, [IO.FileMode]::Create)
    try {
        $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            $directories = @($Prefix)
            foreach ($relative in $Files) {
                $parent = [IO.Path]::GetDirectoryName($relative).Replace('\','/')
                if ($parent) { $directories += $Prefix + $parent + '/' }
            }
            foreach ($directory in @($directories | Sort-Object -Unique)) {
                $entry = $archive.CreateEntry($directory, [IO.Compression.CompressionLevel]::NoCompression)
                $entry.ExternalAttributes = ([int]0x41ED -shl 16) -bor 0x10
            }
            foreach ($relative in $Files) {
                $entryName = $Prefix + $relative.Replace('\','/')
                $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::NoCompression)
                $entry.ExternalAttributes = ([int]0x81A4 -shl 16) -bor 0x20
                $pilhaOutputStream = $entry.Open()
                $pilhaSourceStream = [IO.File]::OpenRead((Join-Path $pilhaSource $relative))
                try { $pilhaSourceStream.CopyTo($pilhaOutputStream) } finally { $pilhaSourceStream.Dispose(); $pilhaOutputStream.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
    # Adobe's installer expects Unix-origin ZIP attributes, including an
    # explicit bundle directory. ZipArchive on Windows otherwise writes DOS
    # origin even with Unix permission bits set above.
    $bytes = [IO.File]::ReadAllBytes($Destination)
    $end = $bytes.Length - 22
    if ([BitConverter]::ToUInt32($bytes,$end) -ne 0x06054b50) { throw 'Diretorio ZIP invalido.' }
    $count = [BitConverter]::ToUInt16($bytes,$end + 10)
    $cursor = [int][BitConverter]::ToUInt32($bytes,$end + 16)
    for ($i = 0; $i -lt $count; $i++) {
        if ([BitConverter]::ToUInt32($bytes,$cursor) -ne 0x02014b50) { throw 'Entrada ZIP invalida.' }
        $bytes[$cursor + 5] = 3
        $cursor += 46 + [BitConverter]::ToUInt16($bytes,$cursor + 28) + [BitConverter]::ToUInt16($bytes,$cursor + 30) + [BitConverter]::ToUInt16($bytes,$cursor + 32)
    }
    if ($cursor -ne $end) { throw 'Tamanho ZIP inconsistente.' }
    [IO.File]::WriteAllBytes($Destination,$bytes)
    $verify = [IO.Compression.ZipFile]::OpenRead($Destination)
    try {
        if (-not $verify.GetEntry($Prefix)) { throw 'Pasta raiz do pacote ausente.' }
        foreach ($relative in $Files) {
            $entry = $verify.GetEntry($Prefix + $relative.Replace('\','/'))
            if (-not $entry) { throw "Arquivo ausente no pacote: $relative" }
            $hash = [Security.Cryptography.SHA256]::Create()
            $entryStream = $entry.Open()
            try { $actual = [BitConverter]::ToString($hash.ComputeHash($entryStream)).Replace('-','') }
            finally { $entryStream.Dispose(); $hash.Dispose() }
            if ($actual -ne (Get-FileHash -LiteralPath (Join-Path $pilhaSource $relative) -Algorithm SHA256).Hash) { throw "Arquivo divergente no pacote: $relative" }
        }
    } finally { $verify.Dispose() }
}
Write-PilhaArchive $pilhaCcx $pilhaRuntimeFiles ($pilhaManifest.id + '/')
Write-PilhaArchive $pilhaZip $pilhaSourceFiles 'FastBind/'
Get-Item -LiteralPath $pilhaCcx,$pilhaZip | Select-Object FullName,Length
