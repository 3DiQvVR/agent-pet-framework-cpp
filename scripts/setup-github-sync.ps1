param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'PetCore GitHub Sync.lnk'
if ($Disable) {
    git config --local petcore.autosync.enabled false
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Host 'Auto sync disabled. The running worker will stop syncing within 15 seconds.'
    exit 0
}
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0) { throw 'Configure origin first.' }
$branch = git symbolic-ref --short HEAD
if ($LASTEXITCODE -ne 0) { throw 'Check out a branch first.' }
git config --local petcore.autosync.remote $remote
git config --local petcore.autosync.branch $branch
git config --local petcore.autosync.enabled true
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$worker = Join-Path $PSScriptRoot 'github-sync.ps1'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $worker + '"'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Save()
Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden
Write-Host "Auto sync enabled for $branch -> $remote. Starts at Windows sign-in."
