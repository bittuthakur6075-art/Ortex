Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('C:\Code\Ortex\src\assets\logo.png')
$colors = @{}
for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
        $pixel = $img.GetPixel($x, $y)
        if ($pixel.A -gt 200) {
            $hex = '#{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B
            if (-not $colors.ContainsKey($hex)) {
                $colors[$hex] = 0
            }
            $colors[$hex]++
        }
    }
}
$colors.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5
