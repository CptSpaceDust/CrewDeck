!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "071225"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "EAF8FF"
!endif

Var CrewBackgroundCheckbox
Var CrewStartupCheckbox
Var CrewLockCheckbox
Var CrewMinimizedCheckbox
Var CrewBackgroundValue
Var CrewStartupValue
Var CrewLockValue
Var CrewMinimizedValue
Var CrewOptionLabel

Page custom CrewDeckOptionsPage CrewDeckOptionsLeave

Function CrewDeckOptionsPage
  IfSilent 0 +2
  Abort
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "DCEEFF" "071225"
  ${NSD_CreateLabel} 0 0 100% 24u "Set up CrewDeck"
  Pop $1
  CreateFont $2 "Segoe UI" 15 700
  SendMessage $1 ${WM_SETFONT} $2 0
  SetCtlColors $1 "EAF8FF" "071225"
  ${NSD_CreateLabel} 0 28u 100% 24u "Choose how CrewDeck should behave. You can change these later in Settings."
  Pop $1
  SetCtlColors $1 "A9CBE4" "071225"
  ${NSD_CreateCheckbox} 0 62u 18u 18u ""
  Pop $CrewBackgroundCheckbox
  ${NSD_Check} $CrewBackgroundCheckbox
  SetCtlColors $CrewBackgroundCheckbox "FFFFFF" "071225"
  ${NSD_CreateLabel} 24u 62u 94% 18u "Keep notifications and calls active after I close the window"
  Pop $CrewOptionLabel
  SetCtlColors $CrewOptionLabel "FFFFFF" "071225"
  ${NSD_CreateCheckbox} 0 88u 18u 18u ""
  Pop $CrewStartupCheckbox
  SetCtlColors $CrewStartupCheckbox "FFFFFF" "071225"
  ${NSD_CreateLabel} 24u 88u 94% 18u "Start CrewDeck when I sign in to Windows"
  Pop $CrewOptionLabel
  SetCtlColors $CrewOptionLabel "FFFFFF" "071225"
  ${NSD_CreateCheckbox} 0 114u 18u 18u ""
  Pop $CrewMinimizedCheckbox
  SetCtlColors $CrewMinimizedCheckbox "FFFFFF" "071225"
  ${NSD_CreateLabel} 24u 114u 94% 18u "Open CrewDeck minimized when Windows starts"
  Pop $CrewOptionLabel
  SetCtlColors $CrewOptionLabel "FFFFFF" "071225"
  ${NSD_CreateCheckbox} 0 140u 18u 18u ""
  Pop $CrewLockCheckbox
  SetCtlColors $CrewLockCheckbox "FFFFFF" "071225"
  ${NSD_CreateLabel} 24u 140u 94% 18u "Help me configure an app-lock PIN on first launch"
  Pop $CrewOptionLabel
  SetCtlColors $CrewOptionLabel "FFFFFF" "071225"
  ${NSD_CreateLabel} 0 174u 100% 32u "Background access is used only for CrewDeck notifications, messages, calls, calendar sync status, and updates."
  Pop $1
  SetCtlColors $1 "7FA8C6" "071225"
  nsDialogs::Show
FunctionEnd

Function CrewDeckOptionsLeave
  ${NSD_GetState} $CrewBackgroundCheckbox $CrewBackgroundValue
  ${NSD_GetState} $CrewStartupCheckbox $CrewStartupValue
  ${NSD_GetState} $CrewLockCheckbox $CrewLockValue
  ${NSD_GetState} $CrewMinimizedCheckbox $CrewMinimizedValue
FunctionEnd

!macro customInit
  ${if} ${isUpdated}
    ; NSIS owns the update lifetime. The small native animation remains alive
    ; after Electron exits, without keeping installed application files open.
    SetSilent silent
    InitPluginsDir
    File /oname=$PLUGINSDIR\UpdateAnimation.exe "${BUILD_RESOURCES_DIR}\UpdateAnimation.exe"
    System::Call 'kernel32::GetCurrentProcessId() i .r0'
    Exec '"$PLUGINSDIR\UpdateAnimation.exe" $0'
  ${endif}
!macroend

!macro customInstall
  IfSilent CrewDeckPreferencesDone 0
  CreateDirectory "$APPDATA\CrewDeck"
  FileOpen $0 "$APPDATA\CrewDeck\installer-preferences.json" w
  FileWrite $0 '{$\r$\n  "background": $CrewBackgroundValue,$\r$\n  "startup": $CrewStartupValue,$\r$\n  "startMinimized": $CrewMinimizedValue,$\r$\n  "appLockSetup": $CrewLockValue,$\r$\n  "applied": false$\r$\n}$\r$\n'
  FileClose $0
  CrewDeckPreferencesDone:
!macroend
