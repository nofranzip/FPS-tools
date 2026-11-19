Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!define APP "FPSpaint"
!define VER "1.1.7"
Name "${APP}"
OutFile "dist\FPSpaint-Setup-${VER}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
RequestExecutionLevel user
!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\FPSpaint.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir FPSpaint"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"
VIProductVersion "${VER}.0"
VIAddVersionKey /LANG=${LANG_SPANISH} "ProductName" "${APP}"
VIAddVersionKey /LANG=${LANG_SPANISH} "FileDescription" "Instalador de ${APP}"
VIAddVersionKey /LANG=${LANG_SPANISH} "FileVersion" "${VER}"
VIAddVersionKey /LANG=${LANG_SPANISH} "CompanyName" "Nova_323"
VIAddVersionKey /LANG=${LANG_SPANISH} "LegalCopyright" "Nova_323"
Section "FPSpaint"
  nsExec::Exec 'taskkill /IM FPSpaint.exe /F'
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  File "build\icon.ico"
  WriteUninstaller "$INSTDIR\Desinstalar FPSpaint.exe"
  CreateShortcut "$DESKTOP\FPSpaint.lnk" "$INSTDIR\FPSpaint.exe" "" "$INSTDIR\icon.ico"
  CreateDirectory "$SMPROGRAMS\FPSpaint"
  CreateShortcut "$SMPROGRAMS\FPSpaint\FPSpaint.lnk" "$INSTDIR\FPSpaint.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\FPSpaint\Desinstalar FPSpaint.lnk" "$INSTDIR\Desinstalar FPSpaint.exe"
  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayName" "${APP}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "Publisher" "Nova_323"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "UninstallString" '"$INSTDIR\Desinstalar FPSpaint.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "NoModify" 1
SectionEnd
Section "Uninstall"
  nsExec::Exec 'taskkill /IM FPSpaint.exe /F'
  Delete "$DESKTOP\FPSpaint.lnk"
  RMDir /r "$SMPROGRAMS\FPSpaint"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"
  DeleteRegKey HKCU "Software\${APP}"
SectionEnd
