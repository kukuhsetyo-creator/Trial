<#
.SYNOPSIS
    Membangun RaschLite untuk Windows: virtualenv, dependensi, pytest, PyInstaller --onedir,
    laporan ukuran, uji mandiri executable, uji waktu startup, dan installer Inno Setup.

.DESCRIPTION
    Jalankan dari PowerShell (bukan PowerShell ISE) di folder rasch-lite:

        powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1

    Hasil:
        dist\RaschLite\RaschLite.exe          aplikasi (folder --onedir)
        dist\build_report.txt                 ukuran build, hasil uji mandiri, waktu startup
        dist\installer\RaschLite-<versi>-setup.exe   bila Inno Setup 6 terpasang

    Skrip berhenti dengan galat bila tes, build, atau uji mandiri gagal.

.PARAMETER PythonVersion
    Versi Python 64-bit yang dipakai lewat peluncur 'py' (default 3.11; 3.12 juga didukung).

.PARAMETER PythonExe
    Path python.exe tertentu untuk membuat virtualenv (misalnya di CI). Bila kosong, dipakai
    peluncur 'py' dengan -PythonVersion.

.PARAMETER SkipTests
    Lewati pytest (tidak disarankan untuk build rilis).

.PARAMETER SkipInstaller
    Jangan membuat installer meskipun Inno Setup tersedia.
#>
param(
    [string]$PythonVersion = "3.11",
    [string]$PythonExe = "",
    [switch]$SkipTests,
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Venv = Join-Path $Root ".venv-win"
$Py = Join-Path $Venv "Scripts\python.exe"
$Dist = Join-Path $Root "dist\RaschLite"
$Exe = Join-Path $Dist "RaschLite.exe"
$Report = Join-Path $Root "dist\build_report.txt"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$What) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$What gagal (kode keluar $LASTEXITCODE)." }
}

# --- 1. Virtualenv dan dependensi ------------------------------------------------------
Write-Step "1/7 Virtualenv Python $PythonVersion (.venv-win)"
if (-not (Test-Path $Py) -and $PythonExe) {
    Invoke-Checked $PythonExe @("-m", "venv", $Venv) "Pembuatan virtualenv"
}
if (-not (Test-Path $Py)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        throw "Peluncur 'py' tidak ditemukan. Pasang Python $PythonVersion 64-bit dari python.org (centang 'py launcher')."
    }
    Invoke-Checked "py" @("-$PythonVersion", "-m", "venv", $Venv) "Pembuatan virtualenv"
}
Invoke-Checked $Py @("-m", "pip", "install", "--upgrade", "pip") "Pembaruan pip"
Invoke-Checked $Py @("-m", "pip", "install", "-r", "requirements-build.txt") "Instalasi dependensi"

# --- 2. Tes ------------------------------------------------------------------------------
if ($SkipTests) {
    Write-Step "2/7 pytest dilewati (-SkipTests)"
} else {
    Write-Step "2/7 pytest (GUI diuji tanpa layar: QT_QPA_PLATFORM=offscreen)"
    $env:QT_QPA_PLATFORM = "offscreen"
    try { Invoke-Checked $Py @("-m", "pytest", "-q") "pytest" }
    finally { Remove-Item Env:QT_QPA_PLATFORM -ErrorAction SilentlyContinue }
}

# --- 3. PyInstaller ----------------------------------------------------------------------
Write-Step "3/7 PyInstaller --onedir (raschlite.spec)"
Invoke-Checked $Py @("-m", "PyInstaller", "--noconfirm", "--clean", "raschlite.spec") "PyInstaller"
if (-not (Test-Path $Exe)) { throw "Executable tidak ditemukan: $Exe" }

# --- 4. Ukuran build ---------------------------------------------------------------------
Write-Step "4/7 Ukuran folder build"
$files = Get-ChildItem $Dist -Recurse -File
$bytes = ($files | Measure-Object -Property Length -Sum).Sum
$mb = [math]::Round($bytes / 1MB, 1)
$sizeLine = "Ukuran dist\RaschLite: $mb MB ($bytes byte, $($files.Count) berkas); batas spesifikasi 250 MB"
Write-Host $sizeLine
$largest = $files | Sort-Object Length -Descending | Select-Object -First 10 |
    ForEach-Object { "  {0,7:N1} MB  {1}" -f ($_.Length / 1MB), $_.FullName.Substring($Dist.Length + 1) }

# --- 5. Uji mandiri executable -----------------------------------------------------------
Write-Step "5/7 Uji mandiri executable (--self-test)"
$SelfTestDir = Join-Path $Root "dist\selftest"
if (Test-Path $SelfTestDir) { Remove-Item $SelfTestDir -Recurse -Force }
$proc = Start-Process -FilePath $Exe -ArgumentList "--self-test `"$SelfTestDir`"" -Wait -PassThru
$selfTestFile = Join-Path $SelfTestDir "selftest_result.txt"
$selfTest = if (Test-Path $selfTestFile) { Get-Content $selfTestFile -Encoding UTF8 } else { @("(berkas hasil tidak ditemukan)") }
$selfTest | ForEach-Object { Write-Host $_ }

# --- 6. Waktu startup --------------------------------------------------------------------
Write-Step "6/7 Waktu startup (--startup-check, 3 kali)"
$startupLines = @()
for ($k = 1; $k -le 3; $k++) {
    $file = Join-Path $env:TEMP "raschlite_startup_$k.txt"
    if (Test-Path $file) { Remove-Item $file -Force }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $Exe -ArgumentList "--startup-check `"$file`"" -Wait -PassThru
    $sw.Stop()
    $inner = if (Test-Path $file) { (Get-Content $file -Encoding UTF8) -join " " } else { "-" }
    $line = "  percobaan ${k}: wall-clock {0:N2} detik (termasuk keluar); {1}; kode keluar {2}" -f $sw.Elapsed.TotalSeconds, $inner, $p.ExitCode
    Write-Host $line
    $startupLines += $line
}
Write-Host "  Catatan: percobaan 1 setelah reboot adalah cold start yang sebenarnya (target < 4 detik)."

# --- 7. Installer ------------------------------------------------------------------------
$version = (Select-String -Path "src\raschlite\__init__.py" -Pattern '__version__\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$installerLine = "Installer: tidak dibuat"
if ($SkipInstaller) {
    Write-Step "7/7 Installer dilewati (-SkipInstaller)"
} else {
    Write-Step "7/7 Installer Inno Setup"
    $iscc = @(
        (Get-Command iscc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($iscc) {
        Invoke-Checked $iscc @("/DMyAppVersion=$version", "installer\raschlite.iss") "Inno Setup"
        $installerLine = "Installer: dist\installer\RaschLite-$version-setup.exe"
    } else {
        Write-Host "Inno Setup 6 tidak ditemukan; pasang dari https://jrsoftware.org/isinfo.php lalu jalankan:" -ForegroundColor Yellow
        Write-Host "  ISCC.exe /DMyAppVersion=$version installer\raschlite.iss" -ForegroundColor Yellow
    }
}

# --- Laporan -----------------------------------------------------------------------------
$lines = @("RaschLite $version - laporan build Windows ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))", "",
           $sizeLine, "Berkas terbesar:") + $largest + @("", "Uji mandiri (kode keluar $($proc.ExitCode)):") +
         $selfTest + @("", "Waktu startup:") + $startupLines + @("", $installerLine)
$lines | Set-Content -Path $Report -Encoding UTF8
Write-Host ""
Write-Host "Laporan build: $Report" -ForegroundColor Green
if ($proc.ExitCode -ne 0) { throw "Uji mandiri GAGAL (kode keluar $($proc.ExitCode)); lihat $selfTestFile." }
if ($mb -gt 250) { Write-Warning "Ukuran build $mb MB melampaui batas 250 MB." }
