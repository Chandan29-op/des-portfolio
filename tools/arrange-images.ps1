<#
  Arrange and rename project images, then rebuild js/manifest.js.

  HOW TO USE
    1. In images\_drop\ make ONE FOLDER PER CLIENT and put that client's images inside.
         - Name the folder project-01, project-02 ... to add to that project,
           or give it any name (e.g. "Cafe Mocha") to create the next new project.
         - Inside the folder:
             logo.png (any file with "logo" in its name)  -> logo
             tall 9:16 images, or names containing "story"  -> stories
             everything else                               -> feed posts
             a SUB-FOLDER                                  -> one carousel (slides in name order)
    2. Double-click tools\arrange-images.bat

  Files are MOVED out of _drop and renamed in order, numbered after what already exists:
    images\projects\project-01\post-01.jpg, post-02.jpg ...
    images\projects\project-01\story-01.jpg ...
    images\projects\project-01\carousel-01-01.jpg   (carousel 01, slide 01)
    images\projects\project-01\logo.png

  OPTIONS
    -SortBy Name   (default) natural name order: img2 comes before img10
    -SortBy Date   oldest file first
    -Renumber      close gaps in existing numbering (after you delete some)
    -ManifestOnly  skip renaming, only rebuild js/manifest.js (run after renaming files by hand)
#>
param(
  [ValidateSet("Name", "Date")] [string]$SortBy = "Name",
  [switch]$Renumber,
  [switch]$ManifestOnly
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$Root     = Split-Path -Parent $PSScriptRoot
$Projects = Join-Path $Root "images\projects"
$Drop     = Join-Path $Root "images\_drop"
$Exts     = @(".jpg", ".jpeg", ".png", ".webp")
foreach ($d in @($Projects, $Drop)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null } }

function Pad([int]$n) { return $n.ToString("00") }
function Ext($f) { return $f.Extension.ToLower() }
function NaturalKey($name) { return [regex]::Replace($name, '\d+', { $args[0].Value.PadLeft(10, '0') }) }
function Get-NaturalSorted($items) { return @($items | Sort-Object { NaturalKey $_.Name }) }
function Get-Images([string]$Path) {
  $files = @(Get-ChildItem -LiteralPath $Path -File | Where-Object { $Exts -contains $_.Extension.ToLower() })
  if ($SortBy -eq "Date") { return @($files | Sort-Object LastWriteTime, Name) }
  return Get-NaturalSorted $files
}
function Get-MaxNumber([string]$Dir, [string]$Pattern) {
  $max = 0
  if (-not (Test-Path $Dir)) { return 0 }
  Get-ChildItem -LiteralPath $Dir | ForEach-Object {
    $m = [regex]::Match($_.BaseName, $Pattern)
    if ($m.Success -and [int]$m.Groups[1].Value -gt $max) { $max = [int]$m.Groups[1].Value }
  }
  return $max
}
function Test-Tall($file) {
  try {
    $img = [System.Drawing.Image]::FromFile($file.FullName)
    try { return ($img.Height / $img.Width) -ge 1.6 } finally { $img.Dispose() }
  } catch { return $false }   # webp and unreadable files count as posts
}

# Two-step rename so swapping numbers never collides with an existing file.
function Move-Safely($pairs) {
  $temp = @()
  foreach ($p in $pairs) {
    $tmp = Join-Path (Split-Path $p.To) ("__tmp_" + [guid]::NewGuid().ToString("N") + [IO.Path]::GetExtension($p.To))
    Move-Item -LiteralPath $p.From -Destination $tmp
    $temp += [pscustomobject]@{ Tmp = $tmp; Final = $p.To }
  }
  foreach ($t in $temp) { Move-Item -LiteralPath $t.Tmp -Destination $t.Final }
}
function Pair($from, [string]$to) { return [pscustomobject]@{ From = $from.FullName; To = $to } }

function Renumber-Project([string]$Dir) {
  $pairs = @()
  foreach ($kind in @("post", "story")) {
    $files = Get-NaturalSorted (Get-ChildItem -LiteralPath $Dir -File | Where-Object { $_.BaseName -match "^$kind-\d+$" })
    $i = 0
    foreach ($f in $files) { $i++; $pairs += Pair $f (Join-Path $Dir "$kind-$(Pad $i)$(Ext $f)") }
  }
  $groups = Get-ChildItem -LiteralPath $Dir -File | Where-Object { $_.BaseName -match '^carousel-\d+-\d+$' } |
    Group-Object { [int]([regex]::Match($_.BaseName, '^carousel-(\d+)').Groups[1].Value) } | Sort-Object { [int]$_.Name }
  $c = 0
  foreach ($g in $groups) {
    $c++; $s = 0
    foreach ($f in (Get-NaturalSorted $g.Group)) { $s++; $pairs += Pair $f (Join-Path $Dir "carousel-$(Pad $c)-$(Pad $s)$(Ext $f)") }
  }
  if ($pairs.Count) { Move-Safely $pairs }
}

if (-not $ManifestOnly) {
  $loose = @(Get-Images $Drop)
  if ($loose.Count) { Write-Host "Skipped $($loose.Count) image(s) loose in images\_drop. Put them inside a client folder." -ForegroundColor Yellow }

  $nextProject = Get-MaxNumber $Projects '^project-(\d+)$'
  foreach ($folder in (Get-NaturalSorted (Get-ChildItem -LiteralPath $Drop -Directory))) {
    $m = [regex]::Match($folder.Name, '^project-(\d+)$')
    if ($m.Success) { $num = [int]$m.Groups[1].Value } else { $nextProject++; $num = $nextProject }
    if ($num -gt $nextProject) { $nextProject = $num }
    $id  = "project-$(Pad $num)"
    $dir = Join-Path $Projects $id
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }

    $postN  = Get-MaxNumber $dir '^post-(\d+)$'
    $storyN = Get-MaxNumber $dir '^story-(\d+)$'
    $carN   = Get-MaxNumber $dir '^carousel-(\d+)-\d+$'
    $pairs = @(); $added = @{ post = 0; story = 0; carousel = 0; logo = 0 }

    foreach ($f in (Get-Images $folder.FullName)) {
      if ($f.BaseName -match 'logo') {
        Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.BaseName -eq "logo" } |
          ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination (Join-Path $dir ("logo-old-" + (Get-Date -Format "yyyyMMddHHmmss") + $_.Extension)) }
        $pairs += Pair $f (Join-Path $dir "logo$(Ext $f)"); $added.logo++
      } elseif ($f.BaseName -match 'stor(y|ies)' -or (Test-Tall $f)) {
        $storyN++; $pairs += Pair $f (Join-Path $dir "story-$(Pad $storyN)$(Ext $f)"); $added.story++
      } else {
        $postN++; $pairs += Pair $f (Join-Path $dir "post-$(Pad $postN)$(Ext $f)"); $added.post++
      }
    }
    foreach ($sub in (Get-NaturalSorted (Get-ChildItem -LiteralPath $folder.FullName -Directory))) {
      $slides = @(Get-Images $sub.FullName)
      if (-not $slides.Count) { continue }
      $carN++; $s = 0
      foreach ($f in $slides) { $s++; $pairs += Pair $f (Join-Path $dir "carousel-$(Pad $carN)-$(Pad $s)$(Ext $f)") }
      $added.carousel++
    }
    if ($pairs.Count) { Move-Safely $pairs }

    # Remove the drop folder once it is empty.
    Get-ChildItem -LiteralPath $folder.FullName -Directory | Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force) } | Remove-Item
    if (-not (Get-ChildItem -LiteralPath $folder.FullName -Force)) { Remove-Item -LiteralPath $folder.FullName }

    Write-Host ("{0} ({1}): {2} posts, {3} stories, {4} carousels{5}" -f $id, $folder.Name, $added.post, $added.story, $added.carousel, $(if ($added.logo) { ", logo" } else { "" })) -ForegroundColor Green
  }

  if ($Renumber) {
    Get-ChildItem -LiteralPath $Projects -Directory | Where-Object { $_.Name -match '^project-\d+$' } | ForEach-Object { Renumber-Project $_.FullName }
    Write-Host "Renumbered existing images." -ForegroundColor Cyan
  }
}

# --- Build js/manifest.js from what is on disk ---
function Js([string[]]$names) { if (-not $names -or $names.Count -eq 0) { return "[]" }; return "[" + (($names | ForEach-Object { '"' + $_ + '"' }) -join ", ") + "]" }
function Names($dir, $pattern) {
  return @(Get-NaturalSorted (Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.BaseName -match $pattern -and $Exts -contains $_.Extension.ToLower() }) | ForEach-Object Name)
}

$entries = @()
$summary = @()
foreach ($p in (Get-NaturalSorted (Get-ChildItem -LiteralPath $Projects -Directory | Where-Object { $_.Name -match '^project-\d+$' }))) {
  $posts   = Names $p.FullName '^post-\d+$'
  $stories = Names $p.FullName '^story-\d+$'
  $logo    = @(Names $p.FullName '^logo$') | Select-Object -First 1
  $groups  = Get-ChildItem -LiteralPath $p.FullName -File |
    Where-Object { $_.BaseName -match '^carousel-\d+-\d+$' -and $Exts -contains $_.Extension.ToLower() } |
    Group-Object { [int]([regex]::Match($_.BaseName, '^carousel-(\d+)').Groups[1].Value) } | Sort-Object { [int]$_.Name }
  $cars = @($groups | ForEach-Object { Js @(Get-NaturalSorted $_.Group | ForEach-Object Name) })
  $carJs = if ($cars.Count) { "[" + ($cars -join ", ") + "]" } else { "[]" }
  $entries += @"
    {
      "id": "$($p.Name)",
      "logo": "$logo",
      "posts": $(Js $posts),
      "stories": $(Js $stories),
      "carousels": $carJs
    }
"@
  $summary += "$($p.Name): $($posts.Count) posts, $($stories.Count) stories, $(@($groups).Count) carousels"
}

$body = if ($entries.Count) { "[`n" + ($entries -join ",`n") + "`n  ]" } else { "[]" }
$js = @"
// AUTO-GENERATED by tools/arrange-images.ps1. Do not edit by hand.
// A project missing here uses the fallback counts in js/content.js.
window.MANIFEST = {
  "projects": $body
};
"@
[IO.File]::WriteAllText((Join-Path $Root "js\manifest.js"), $js.Replace("`r`n", "`n") + "`n", (New-Object Text.UTF8Encoding $false))

Write-Host ""
if ($summary.Count) { $summary | ForEach-Object { Write-Host $_ -ForegroundColor Cyan } } else { Write-Host "No projects yet. Manifest is empty, the site shows placeholders." -ForegroundColor Yellow }
