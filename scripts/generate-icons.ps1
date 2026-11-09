Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outDir = "$PSScriptRoot\..\assets\icons"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Pixel M3 Circular Background in Rich Primary Blue (#0B57D0)
    $margin = [Math]::Max(1, [Math]::Round($size * 0.04))
    $diam = $size - (2 * $margin)
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 87, 208)) # #0B57D0
    $g.FillEllipse($bgBrush, $margin, $margin, $diam, $diam)

    # Subtle inner accent border in Gemini Light Blue (#A8C7FA)
    $penWidth = [Math]::Max(1.0, $size * 0.05)
    $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 168, 199, 250), $penWidth) # #A8C7FA
    $g.DrawEllipse($accentPen, $margin + ($penWidth / 2.0), $margin + ($penWidth / 2.0), $diam - $penWidth, $diam - $penWidth)

    # Crisp bold typography: "4K"
    $fontSize = $size * 0.44
    if ($size -eq 16) { $fontSize = 8.0 }
    if ($size -eq 32) { $fontSize = 14.5 }
    if ($size -eq 48) { $fontSize = 22.0 }
    if ($size -eq 128) { $fontSize = 58.0 }

    $fontFamily = [System.Drawing.FontFamily]::GenericSansSerif
    # Try Segoe UI or Arial if available
    try {
        $testFont = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
        $font = $testFont
    } catch {
        $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    }

    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    # Slight optical center adjustment
    $yOffset = if ($size -eq 16) { -0.5 } else { $size * -0.02 }
    $textRect.Y += $yOffset

    $g.DrawString("4K", $font, $textBrush, $textRect, $stringFormat)

    $outPath = Join-Path $outDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated: $outPath ($size x $size)"
}
