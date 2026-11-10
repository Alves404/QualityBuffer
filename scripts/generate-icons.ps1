Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outDir = "$PSScriptRoot\..\assets\icons"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Get-RoundedRectPath($rect, $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    [float]$diameter = [float]($radius * 2.0)
    $arc = New-Object System.Drawing.RectangleF([float]$rect.X, [float]$rect.Y, $diameter, $diameter)
    
    # Top-left arc
    $path.AddArc($arc, [float]180, [float]90)
    
    # Top-right arc
    $arc.X = [float]($rect.Right - $diameter)
    $path.AddArc($arc, [float]270, [float]90)
    
    # Bottom-right arc
    $arc.Y = [float]($rect.Bottom - $diameter)
    $path.AddArc($arc, [float]0, [float]90)
    
    # Bottom-left arc
    $arc.X = [float]$rect.Left
    $path.AddArc($arc, [float]90, [float]90)
    
    $path.CloseFigure()
    return $path
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded Squircle Geometry matching 🔁 emoji / Material 3
    [float]$margin = [float]([Math]::Max(0.5, [double]($size * 0.04)))
    [float]$boxSize = [float]($size - (2.0 * $margin))
    [float]$radius = [float]($boxSize * 0.24)
    if ($radius -lt 2.0) { $radius = 2.0 }
    
    $rect = New-Object System.Drawing.RectangleF($margin, $margin, $boxSize, $boxSize)
    $roundPath = Get-RoundedRectPath $rect $radius

    # Fill with vibrant Blue (#1A73E8) gradient to (#0B57D0)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 26, 115, 232), # #1A73E8 (Google Blue)
        [System.Drawing.Color]::FromArgb(255, 11, 87, 208),  # #0B57D0 (Deep Blue)
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillPath($bgBrush, $roundPath)

    # Subtle inner border for contrast
    [float]$borderPenWidth = [float]([Math]::Max(0.5, $size * 0.03))
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 255, 255, 255), $borderPenWidth)
    $g.DrawPath($borderPen, $roundPath)

    # White Repeat / Loading Loop (🔁) geometry
    [float]$strokeWidth = [float]([Math]::Max(1.8, $size * 0.10))
    if ($size -eq 16) { $strokeWidth = 2.0 }
    if ($size -eq 32) { $strokeWidth = 3.6 }
    if ($size -eq 48) { $strokeWidth = 5.2 }
    if ($size -eq 128) { $strokeWidth = 13.5 }

    $loopPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $strokeWidth)
    $loopPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $loopPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $loopPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    [float]$scale = [float]($size / 24.0)

    # Top Arrow: curves from left (x=3.5, y=10.5) up to top (x=7.5, y=5.5) then line to (x=19.5, y=5.5)
    $topPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $topPath.AddLine([float](3.5 * $scale), [float](10.5 * $scale), [float](3.5 * $scale), [float](9.0 * $scale))
    $arcRectTop = New-Object System.Drawing.RectangleF([float](3.5 * $scale), [float](5.5 * $scale), [float](7.0 * $scale), [float](7.0 * $scale))
    $topPath.AddArc($arcRectTop, [float]180, [float]90)
    $topPath.AddLine([float](7.0 * $scale), [float](5.5 * $scale), [float](19.0 * $scale), [float](5.5 * $scale))
    $g.DrawPath($loopPen, $topPath)

    # Top Arrow Head (pointing right at x=19.0, y=5.5)
    [float]$headSize = [float](3.6 * $scale)
    [float]$topTipX = [float](19.0 * $scale)
    [float]$topTipY = [float](5.5 * $scale)
    $topHeadP1 = [System.Drawing.PointF]::new($topTipX - $headSize, $topTipY - $headSize)
    $topHeadP2 = [System.Drawing.PointF]::new($topTipX, $topTipY)
    $topHeadP3 = [System.Drawing.PointF]::new($topTipX - $headSize, $topTipY + $headSize)
    $g.DrawLines($loopPen, [System.Drawing.PointF[]]@($topHeadP1, $topHeadP2, $topHeadP3))

    # Bottom Arrow: curves from right (x=20.5, y=13.5) down to bottom (x=16.5, y=18.5) then line to (x=5.0, y=18.5)
    $botPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $botPath.AddLine([float](20.5 * $scale), [float](13.5 * $scale), [float](20.5 * $scale), [float](15.0 * $scale))
    $arcRectBot = New-Object System.Drawing.RectangleF([float](13.5 * $scale), [float](11.5 * $scale), [float](7.0 * $scale), [float](7.0 * $scale))
    $botPath.AddArc($arcRectBot, [float]0, [float]90)
    $botPath.AddLine([float](17.0 * $scale), [float](18.5 * $scale), [float](5.0 * $scale), [float](18.5 * $scale))
    $g.DrawPath($loopPen, $botPath)

    # Bottom Arrow Head (pointing left at x=5.0, y=18.5)
    [float]$botTipX = [float](5.0 * $scale)
    [float]$botTipY = [float](18.5 * $scale)
    $botHeadP1 = [System.Drawing.PointF]::new($botTipX + $headSize, $botTipY + $headSize)
    $botHeadP2 = [System.Drawing.PointF]::new($botTipX, $botTipY)
    $botHeadP3 = [System.Drawing.PointF]::new($botTipX + $headSize, $botTipY - $headSize)
    $g.DrawLines($loopPen, [System.Drawing.PointF[]]@($botHeadP1, $botHeadP2, $botHeadP3))

    $outPath = Join-Path $outDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $botPath.Dispose()
    $topPath.Dispose()
    $loopPen.Dispose()
    $borderPen.Dispose()
    $bgBrush.Dispose()
    $roundPath.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated Blue Repeat/Loading Icon (🔁): $outPath ($size x $size)"
}
