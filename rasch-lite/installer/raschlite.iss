; Installer RaschLite by CSPS (Inno Setup 6.x)
;
; Bangun dari folder rasch-lite setelah PyInstaller selesai:
;     ISCC.exe /DMyAppVersion=0.1.0 installer\raschlite.iss
; Hasil: dist\installer\RaschLite-<versi>-setup.exe
;
; Installer berbahasa Inggris karena bahasa Indonesia bukan terjemahan resmi Inno Setup 6.
; Instalasi tidak memerlukan hak administrator: default ke folder program pengguna
; (%LOCALAPPDATA%\Programs\RaschLite); pengguna dapat memilih instalasi untuk semua pengguna.

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppName "RaschLite by CSPS"
#define MyAppShortName "RaschLite"
#define MyAppExeName "RaschLite.exe"
#define MyAppPublisher "Center for Social Psychology and Society (CSPS)"

[Setup]
; AppId tetap untuk semua versi agar pembaruan menggantikan instalasi lama.
AppId={{16FB5464-4851-4A39-83F3-B17DD48616F9}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppShortName}
DefaultGroupName={#MyAppShortName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist\installer
OutputBaseFilename={#MyAppShortName}-{#MyAppVersion}-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName} {#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=..\src\raschlite\resources\brand\raschlite.ico
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\RaschLite\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppShortName}}"; Flags: nowait postinstall skipifsilent
