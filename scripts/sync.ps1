# Sync between the local SQLite DB and the committed JSONL.
#
# Usage:
#   pwsh scripts/sync.ps1 export   # DB  → data_store/knowledge.jsonl  (run before commit)
#   pwsh scripts/sync.ps1 import   # JSONL → DB                        (run after git pull)

$ErrorActionPreference = "Stop"

$env:UV_LINK_MODE = "copy"

$Mode = $args[0]
if ($Mode -ne "export" -and $Mode -ne "import") {
    Write-Error "Usage: scripts/sync.ps1 (export | import)"
    exit 2
}

$Playground  = Split-Path -Parent $PSScriptRoot
$DbPath      = Join-Path $Playground "data_store\knowledge.db"
$JsonlPath   = Join-Path $Playground "data_store\knowledge.jsonl"
$BrainGitUrl = "git+https://github.com/agnivadc/knowledge-brain.git"

if ($Mode -eq "export") {
    if (-not (Test-Path $DbPath)) {
        Write-Error "DB not found at $DbPath. Run bootstrap.ps1 first."
        exit 1
    }
    & uvx --from $BrainGitUrl brain --db-path $DbPath export $JsonlPath
} else {
    if (-not (Test-Path $JsonlPath)) {
        Write-Error "JSONL not found at $JsonlPath."
        exit 1
    }
    if (-not (Test-Path $DbPath)) {
        Write-Host "DB not found; will be created during import."
    }
    & uvx --from $BrainGitUrl brain --db-path $DbPath import $JsonlPath
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "brain $Mode failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
