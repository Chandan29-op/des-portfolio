<#
  Local server for admin.html. Start it with Admin.bat (in the portfolio folder).
  Listens on this computer only (localhost). Close the window to stop it.

  It serves the site files and lets the admin page save:
    - images inside images\
    - js\content.js and js\manifest.js
  Nothing else can be written.
#>
param([int]$Port = 5510, [switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd('\')
$Types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"; ".md" = "text/plain; charset=utf-8"; ".svg" = "image/svg+xml"
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"; ".ico" = "image/x-icon"
}

function Resolve-Safe([string]$Rel, [switch]$Write) {
  if ([string]::IsNullOrWhiteSpace($Rel)) { throw "Missing path" }
  $full = [IO.Path]::GetFullPath((Join-Path $Root ($Rel.Replace('/', '\').TrimStart('\'))))
  if (-not $full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path is outside the portfolio folder" }
  if ($Write) {
    $r = $full.Substring($Root.Length + 1).ToLower()
    if (-not ($r.StartsWith('images\') -or $r -eq 'js\content.js' -or $r -eq 'js\manifest.js')) { throw "Not allowed to change $Rel" }
  }
  return $full
}

function Send($Ctx, [int]$Code, [byte[]]$Bytes, [string]$Type) {
  $res = $Ctx.Response
  $res.StatusCode = $Code
  $res.ContentType = $Type
  $res.Headers["Cache-Control"] = "no-store"
  $res.ContentLength64 = $Bytes.Length
  $res.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $res.Close()
}
function Send-Text($Ctx, [int]$Code, [string]$Text, [string]$Type = "text/plain; charset=utf-8") {
  Send $Ctx $Code ([Text.Encoding]::UTF8.GetBytes($Text)) $Type
}
function Json-String([string]$s) { return '"' + $s.Replace('\', '\\').Replace('"', '\"') + '"' }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not start on port $Port. Is the admin already open in another window?" -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

$url = "http://localhost:$Port/admin.html"
Write-Host ""
Write-Host "  Portfolio admin is running." -ForegroundColor Green
Write-Host "  Admin:   $url"
Write-Host "  Website: http://localhost:$Port/index.html"
Write-Host ""
Write-Host "  Keep this window open while you edit. Close it to stop." -ForegroundColor Yellow
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  try {
    # Only accept requests addressed to this machine (blocks DNS-rebinding tricks).
    if ($req.Url.Host -ne "localhost") { Send-Text $ctx 403 "Forbidden"; continue }
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

    if ($path.StartsWith("/api/")) {
      # Custom header: other websites open in the browser cannot send it, so they cannot write files.
      if ($req.Headers["X-Admin"] -ne "1") { Send-Text $ctx 403 "Forbidden"; continue }
      $q = $req.QueryString

      switch ($path) {
        "/api/list" {
          $dir = Resolve-Safe $q["dir"]
          $dirs = @(); $files = @()
          if (Test-Path -LiteralPath $dir -PathType Container) {
            $dirs  = @(Get-ChildItem -LiteralPath $dir -Directory | ForEach-Object { Json-String $_.Name })
            $files = @(Get-ChildItem -LiteralPath $dir -File | ForEach-Object { '{"name":' + (Json-String $_.Name) + ',"size":' + $_.Length + '}' })
          }
          Send-Text $ctx 200 ('{"dirs":[' + ($dirs -join ",") + '],"files":[' + ($files -join ",") + ']}') "application/json; charset=utf-8"
        }
        "/api/file" {
          if ($req.HttpMethod -ne "PUT") { Send-Text $ctx 405 "Use PUT"; break }
          $full = Resolve-Safe $q["path"] -Write
          [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($full)) | Out-Null
          $fs = [IO.File]::Create($full)
          try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
          Send-Text $ctx 200 "ok"
        }
        "/api/move" {
          if ($req.HttpMethod -ne "POST") { Send-Text $ctx 405 "Use POST"; break }
          $from = Resolve-Safe $q["from"] -Write
          $to   = Resolve-Safe $q["to"] -Write
          if (Test-Path -LiteralPath $to) { Send-Text $ctx 409 "Already exists: $($q['to'])"; break }
          [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to)) | Out-Null
          if (Test-Path -LiteralPath $from -PathType Container) { [IO.Directory]::Move($from, $to) }
          elseif (Test-Path -LiteralPath $from -PathType Leaf) { [IO.File]::Move($from, $to) }
          else { Send-Text $ctx 404 "Not found: $($q['from'])"; break }
          Send-Text $ctx 200 "ok"
        }
        "/api/mkdir" {
          if ($req.HttpMethod -ne "POST") { Send-Text $ctx 405 "Use POST"; break }
          [IO.Directory]::CreateDirectory((Resolve-Safe $q["path"] -Write)) | Out-Null
          Send-Text $ctx 200 "ok"
        }
        default { Send-Text $ctx 404 "Unknown action" }
      }
      continue
    }

    # Static files
    if ($path -eq "/") { $path = "/admin.html" }
    $full = Resolve-Safe $path
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $type = if ($Types.ContainsKey($ext)) { $Types[$ext] } else { "application/octet-stream" }
      Send $ctx 200 ([IO.File]::ReadAllBytes($full)) $type
    } else {
      Send-Text $ctx 404 "Not found"
    }
  } catch {
    try { Send-Text $ctx 400 $_.Exception.Message } catch {}
  }
}
