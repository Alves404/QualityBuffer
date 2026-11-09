Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outDir = "$PSScriptRoot\..\assets\icons"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Get-RoundedRectPath($rect, $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2.0
    $arc = New-Object System.Drawing.RectangleF($rect.X, $rect.Y, $diameter, $diameter)
    
    # Top-left arc
    $path.AddArc($arc, 180, 90)
    
    # Top-right arc
    $arc.X = $rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    
    # Bottom-right arc
    $arc.Y = $rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    
    # Bottom-left arc
    $arc.X = $rect.Left
    $path.AddArc($arc, 90, 90)
    
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

    # Rounded Squircle Geometry matching ✅ emoji
    $margin = [Math]::Max(0.5, [double]($size * 0.04))
    $boxSize = [double]($size - (2.0 * $margin))
    $radius = [double]($boxSize * 0.24)
    if ($radius -lt 2.0) { $radius = 2.0 }
    
    $rect = New-Object System.Drawing.RectangleF([float]$margin, [float]$margin, [float]$boxSize, [float]$boxSize)
    $roundPath = Get-RoundedRectPath $rect $radius

    # Fill with vibrant Blue (#0B57D0) with subtle vertical gradient to (#0842A0)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 26, 115, 232), # #1A73E8 (Google Blue)
        [System.Drawing.Color]::FromArgb(255, 11, 87, 208),  # #0B57D0 (Deep Blue)
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillPath($bgBrush, $roundPath)

    # Subtle inner border for contrast
    $borderPenWidth = [float][Math]::Max(0.5, $size * 0.03)
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 255, 255), $borderPenWidth)
    $g.DrawPath($borderPen, $roundPath)

    # White Checkmark (✓) geometry
    $checkStrokeWidth = [float][Math]::Max(2.0, $size * 0.13)
    if ($size -eq 16) { $checkStrokeWidth = 2.4 }
    if ($size -eq 32) { $checkStrokeWidth = 4.4 }
    if ($size -eq 48) { $checkStrokeWidth = 6.4 }
    if ($size -eq 128) { $checkStrokeWidth = 16.5 }

    $checkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $checkStrokeWidth)
    $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    # Normalized checkmark vertices
    [float]$x1 = $size * 0.27
    [float]$y1 = $size * 0.52
    [float]$x2 = $size * 0.44
    [float]$y2 = $size * 0.69
    [float]$x3 = $size * 0.74
    [float]$y3 = $size * 0.33

    $p1 = [System.Drawing.PointF]::new($x1, $y1)
    $p2 = [System.Drawing.PointF]::new($x2, $y2)
    $p3 = [System.Drawing.PointF]::new($x3, $y3)

    $checkPoints = [System.Drawing.PointF[]]@($p1, $p2, $p3)
    $g.DrawLines($checkPen, $checkPoints)

    $outPath = Join-Path $outDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $checkPen.Dispose()
    $borderPen.Dispose()
    $bgBrush.Dispose()
    $roundPath.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated Blue Verified Checkmark Icon: $outPath ($size x $size)"
}
