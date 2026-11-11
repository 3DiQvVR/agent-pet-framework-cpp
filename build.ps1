# Build PetCore without requiring a system-wide toolchain.
#
#   .\build.ps1              # release build (uses bundled Zig, then CMake, then cl)
#   .\build.ps1 -Tests       # also build and run the self-test
#   .\build.ps1 -Clean       # remove build/
param(
    [switch]$Tests,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$build = Join-Path $root 'build'

if ($Clean -and (Test-Path $build)) {
    Remove-Item -Recurse -Force $build
}
New-Item -ItemType Directory -Force -Path $build | Out-Null
# Zig refuses to run when its global cache lives outside the workspace sandbox.
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $build 'zig-global'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $build 'zig-local'
$env:TMP = Join-Path $build 'tmp'
$env:TEMP = $env:TMP
New-Item -ItemType Directory -Force -Path $env:ZIG_GLOBAL_CACHE_DIR, $env:ZIG_LOCAL_CACHE_DIR, $env:TMP | Out-Null

function Get-Sources {
    param([switch]$ExcludeMain)
    Get-ChildItem (Join-Path $root 'src') -Filter *.cpp |
        Where-Object { -not $ExcludeMain -or $_.Name -ne 'main.cpp' } |
        ForEach-Object { $_.FullName }
}

$zig = @(
    (Join-Path $root '_tools\zig\zig.exe'),
    (Join-Path $root '_tools\zig\ziglang\zig.exe'),
    (Join-Path $root '..\_tools\zig\ziglang\zig.exe'),
    (Join-Path $root '..\_tools\zig\zig.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($zig) {
    Write-Host "Using bundled Zig: $zig"
    $sources = Get-Sources
    $zigArgs = @('c++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Iinclude') + $sources +
               @('-o', (Join-Path $build 'petcore.exe'), '-lwinhttp', '-lws2_32', '-lshell32', '-ldwmapi', '-ladvapi32')
    & $zig @zigArgs
    if ($LASTEXITCODE -ne 0) { throw "Zig build failed ($LASTEXITCODE)" }
    Copy-Item (Join-Path $build 'petcore.exe') (Join-Path $root 'PetCore.exe') -Force

    if ($Tests) {
        $testSources = (Get-Sources -ExcludeMain) + @((Join-Path $root 'tests\self_test.cpp'))
        $testArgs = @('c++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Iinclude') + $testSources +
                    @('-o', (Join-Path $build 'petcore_tests.exe'), '-lwinhttp', '-lws2_32', '-lshell32', '-ldwmapi', '-ladvapi32')
        & $zig @testArgs
        if ($LASTEXITCODE -ne 0) { throw "Zig test build failed ($LASTEXITCODE)" }
        Push-Location $root
        try { & (Join-Path $build 'petcore_tests.exe') } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { throw "Tests failed ($LASTEXITCODE)" }
    }
    Write-Host "Built: $build\petcore.exe"
    exit 0
}

$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if ($cmake) {
    Write-Host "Using CMake: $($cmake.Source)"
    & cmake -S $root -B $build -DCMAKE_BUILD_TYPE=Release "-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=$build"
    if ($LASTEXITCODE -ne 0) { throw "CMake configure failed" }
    & cmake --build $build --config Release
    if ($LASTEXITCODE -ne 0) { throw "CMake build failed" }
    $cmakeExe = Join-Path $build 'Release\petcore.exe'
    if (-not (Test-Path $cmakeExe)) { $cmakeExe = Join-Path $build 'petcore.exe' }
    if (Test-Path $cmakeExe) { Copy-Item $cmakeExe (Join-Path $root 'PetCore.exe') -Force }
    if ($Tests) {
        Push-Location $build
        try { & ctest -C Release --output-on-failure } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
    }
    exit 0
}

throw "No C++ toolchain found. Install CMake + MSVC/MinGW, or place a portable Zig at _tools\zig\zig.exe."
