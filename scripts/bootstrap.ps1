# One-shot setup for the trading-playground.
#
# What this does:
#   1. Verifies `uv` is on PATH (fails fast with install instructions if not)
#   2. Generates .mcp.json from .mcp.json.template with absolute DB path
#   3. Seeds data_store/knowledge.db via uvx (downloads brain on first run)
#
# After this, run `claude` in this directory.

$ErrorActionPreference = "Stop"

# Use copy instead of hardlink for uv's cache; hardlinks fail on cloud-synced
# filesystems (OneDrive, Dropbox, etc.) and the perf cost is negligible.
$env:UV_LINK_MODE = "copy"

$Playground  = Split-Path -Parent $PSScriptRoot
$Template    = Join-Path $Playground ".mcp.json.template"
$McpConfig   = Join-Path $Playground ".mcp.json"
$DbPath      = Join-Path $Playground "data_store\knowledge.db"
$JsonlPath   = Join-Path $Playground "data_store\knowledge.jsonl"
$BrainGitUrl = "git+https://github.com/agnivadc/knowledge-brain.git"

# 1. Check uv is installed
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Write-Error @"
'uv' is not on PATH. Install it first:
  https://docs.astral.sh/uv/getting-started/installation/

On Windows, the quickest install is:
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
"@
    exit 1
}
Write-Host "[1/3] uv found: $($uv.Source)"

# 2. Generate .mcp.json from template
if (-not (Test-Path $Template)) {
    Write-Error "Template not found at $Template"
    exit 1
}
$content = Get-Content $Template -Raw
# JSON path needs escaped backslashes
$dbPathEscaped = $DbPath -replace '\\', '\\'
$content = $content -replace '__DB_PATH__', $dbPathEscaped
Set-Content -Path $McpConfig -Value $content -NoNewline
Write-Host "[2/3] Wrote $McpConfig"

# 3. Build the database from the committed JSONL
$DbDir = Split-Path -Parent $DbPath
New-Item -ItemType Directory -Force $DbDir | Out-Null
if (-not (Test-Path $JsonlPath)) {
    Write-Error "Knowledge JSONL not found at $JsonlPath. The repo is likely incomplete."
    exit 1
}
if (Test-Path $DbPath) {
    Write-Host "      DB exists at $DbPath; removing to rebuild from JSONL"
    Remove-Item $DbPath -Force
}
Write-Host "[3/3] Importing $JsonlPath via uvx (first run downloads the brain package)"
& uvx --from $BrainGitUrl brain --db-path $DbPath import $JsonlPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "brain import failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  1. Open Claude Code in this directory:  claude"
Write-Host "  2. Approve the knowledge-brain MCP server when prompted"
Write-Host "  3. Try the suggested questions in README.md"
