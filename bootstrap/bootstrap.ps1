param(
  [switch]$DryRun,
  [switch]$EnableMcp
)

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Output "MISSING: $name"
    return $false
  }
  Write-Output "FOUND: $name"
  return $true
}

Require-Cmd "python3" | Out-Null

if ($EnableMcp) {
  if (Get-Command "uvx" -ErrorAction SilentlyContinue) {
    Write-Output "MCP_STATUS: available"
  } else {
    Write-Output "MCP_STATUS: unavailable (uvx not installed)"
  }
} else {
  Write-Output "MCP_STATUS: not_configured"
}

New-Item -ItemType Directory -Force -Path (Join-Path $RootDir ".github") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir ".agent-os/runtime") | Out-Null

if (-not $DryRun) {
  $templatePath = Join-Path $RootDir ".mcp.json.template"
  $outPath = Join-Path $RootDir ".mcp.json"
  if (Test-Path $templatePath) {
    (Get-Content $templatePath -Raw) -replace '\$\{PROJECT_ROOT\}', [Regex]::Escape($RootDir).Replace('\\','/') | Set-Content $outPath
    Write-Output "WROTE: .mcp.json"
  }
}

Write-Output "BOOTSTRAP_STATUS: ok"
