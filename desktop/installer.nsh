!macro customInstall
  IfSilent +2
  Goto pdv_skip_relaunch
  Sleep 800
  Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --atualizado'
  pdv_skip_relaunch:
!macroend
