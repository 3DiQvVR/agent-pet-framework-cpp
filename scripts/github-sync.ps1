param([switch]$Once)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$git = (Get-Command git -ErrorAction Stop).Source
$gitDir = (& $git rev-parse --absolute-git-dir).Trim()
$log = Join-Path $gitDir 'github-sync.log'
$mutexName = 'Local\PetCoreGitSync_' + ($root -replace '[^a-zA-Z0-9]', '_')
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { $mutex.Dispose(); exit 0 }
function Invoke-Git {
    param([string[]]$GitArgs)
    $ErrorActionPreference = 'Continue'
    $result = & $git @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
    return ($result -join "`n")
}
function Write-Log([string]$Message) {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 2MB) {
        Move-Item -LiteralPath $log -Destination ($log + '.old') -Force
    }
    Add-Content -LiteralPath $log -Value ((Get-Date -Format o) + ' ' + $Message)
}
function Assert-SafeState {
    if ((Invoke-Git @('config', '--local', '--get', 'petcore.autosync.enabled')) -ne 'true') { throw 'Auto sync disabled.' }
    $branch = Invoke-Git @('config', '--local', '--get', 'petcore.autosync.branch')
    if ((Invoke-Git @('symbolic-ref', '--short', 'HEAD')) -ne $branch) { throw 'Branch changed; sync paused.' }
    $remote = Invoke-Git @('config', '--local', '--get', 'petcore.autosync.remote')
    if ((Invoke-Git @('remote', 'get-url', 'origin')) -ne $remote) { throw 'Remote changed; sync paused.' }
    foreach ($marker in @('index.lock', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply')) {
        if (Test-Path -LiteralPath (Join-Path $gitDir $marker)) { throw "Git operation in progress: $marker" }
    }
    if (Invoke-Git @('ls-files', '--unmerged')) { throw 'Unresolved conflicts; sync paused.' }
}
function Get-Fingerprint {
    $status = Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all')
    if (-not $status) { return '' }
    $parts = @($status, (Invoke-Git @('diff', 'HEAD', '--binary')))
    $untracked = Invoke-Git @('-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard')
    if ($untracked) {
        foreach ($file in ($untracked -split "`n")) {
            $parts += Invoke-Git @('hash-object', '--', $file)
        }
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($parts -join "`n")))) }
    finally { $sha.Dispose() }
}
function Sync-Repository {
    Assert-SafeState
    if (Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all')) {
        Invoke-Git @('add', '--all') | Out-Null
        if (Invoke-Git @('diff', '--cached', '--name-only')) {
            Invoke-Git @('commit', '-m', ('Auto sync ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))) | Out-Null
            Write-Log 'Created automatic commit.'
        }
    }
    $branch = Invoke-Git @('config', '--local', '--get', 'petcore.autosync.branch')
    $pending = Invoke-Git @('rev-list', '--count', "origin/$branch..HEAD")
    if ([int]$pending -gt 0) {
        Invoke-Git @('push', 'origin', "HEAD:refs/heads/$branch") | Out-Null
        Write-Log 'Push succeeded.'
    }
}
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
try {
    if ($Once) { Sync-Repository; exit 0 }
    Write-Log 'Background sync started (15 second polling, 30 second quiet period).'
    $previous = $null
    $stableSince = Get-Date
    while ($true) {
        try {
            Assert-SafeState
            $current = Get-Fingerprint
            if ($current -ne $previous) { $previous = $current; $stableSince = Get-Date }
            if (-not $current -or ((Get-Date) - $stableSince).TotalSeconds -ge 30) {
                Sync-Repository
                $previous = $null
            }
        } catch { Write-Log ('Sync deferred: ' + $_.Exception.Message) }
        Start-Sleep -Seconds 15
    }
} catch {
    Write-Log ('Sync failed: ' + $_.Exception.Message)
    throw
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
