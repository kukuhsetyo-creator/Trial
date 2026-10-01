@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Mulai Aplikasi - Agen Analisis Kualitatif (Windows)
rem Mencari Python 3.11 atau lebih baru, lalu menyerahkan ke peluncur berjendela
rem lewat pythonw agar tidak ada jendela hitam yang tertinggal.

set "PYW="
call :cari py -3
if not defined PYW call :cari python
if not defined PYW goto :tanpa_python
if not exist "%PYW%" goto :tanpa_python

start "" "%PYW%" "%~dp0launcher\launcher.pyw"
exit /b 0

:cari
where %1 >nul 2>nul || exit /b 0
%* -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul || exit /b 0
for /f "usebackq delims=" %%i in (`%* -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))"`) do set "PYW=%%i"
exit /b 0

:tanpa_python
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Aplikasi ini memerlukan Python 3.11 atau yang lebih baru, dan Python belum ditemukan di komputer ini.' + [Environment]::NewLine + [Environment]::NewLine + 'Setelah menekan OK, halaman unduhan Python akan terbuka. Saat memasang, centang pilihan Add python.exe to PATH. Setelah selesai, klik dua kali Mulai Aplikasi lagi.', 'Agen Analisis Kualitatif', 'OK', 'Warning') | Out-Null"
start "" "https://www.python.org/downloads/"
exit /b 1
