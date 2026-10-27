$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler is required to build the update animation.' }
$source = Join-Path $PSScriptRoot 'UpdateAnimation.cs'
$output = Join-Path $PSScriptRoot 'UpdateAnimation.exe'
$artwork = Join-Path (Split-Path $PSScriptRoot -Parent) 'src/renderer/assets/mayu/mayu-update-desk.png'
if (!(Test-Path -LiteralPath $artwork)) { throw 'Mayu updater artwork is missing.' }
& $compiler /nologo /target:winexe /optimize+ /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/resource:$artwork,MayuUpdateDesk.png" "/out:$output" $source
if ($LASTEXITCODE -ne 0) { throw 'Update animation compilation failed.' }

# Rebuild the installer artwork from the same Space Glass palette on every release.
Add-Type -AssemblyName System.Drawing
function New-SpaceGlassBitmap([string]$Path, [int]$Width, [int]$Height, [bool]$Header = $false) {
  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(7,18,37), [System.Drawing.Color]::FromArgb(18,58,101), 55)
  $graphics.FillRectangle($brush, $rect)
  $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38,112,210,255))
  $graphics.FillEllipse($glow, [int](-$Width * .35), [int]($Height * .08), [int]($Width * 1.2), [int]($Width * 1.2))
  $line = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110,126,211,255), 2)
  $graphics.DrawLine($line, 0, $Height - 3, $Width, $Height - 3)
  $fontSize = if ($Header) { 13 } else { 18 }
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font('Segoe UI', $(if ($Header) { 7 } else { 9 }), [System.Drawing.FontStyle]::Regular)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235,248,255))
  $blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(113,201,255))
  $graphics.DrawString('CREWDECK', $font, $white, 14, $(if ($Header) { 8 } else { 34 }))
  $graphics.DrawString('SPACE GLASS INSTALLER', $subFont, $blue, 15, $(if ($Header) { 31 } else { 67 }))
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $font.Dispose(); $subFont.Dispose(); $white.Dispose(); $blue.Dispose(); $line.Dispose(); $glow.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
New-SpaceGlassBitmap (Join-Path $PSScriptRoot 'installer-sidebar.bmp') 164 314 $false
New-SpaceGlassBitmap (Join-Path $PSScriptRoot 'installer-header.bmp') 150 57 $true
