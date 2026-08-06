$fs = New-Object -ComObject Scripting.FileSystemObject
$path = "d:\Appt\大三下\Trae赛2\sandbox-app\src\pages\Community.jsx"
$content = Get-Content $path -Raw -Encoding UTF8
$lines = $content -split "`n"

$foundSages = $false
$insertIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match "activeTab === 'sages'") {
    $foundSages = $true
  }
  if ($foundSages -and $lines[$i] -match "</section>" -and $i -gt 0) {
    $insertIdx = $i + 1
    break
  }
}

Write-Host "Insert at: $insertIdx"
