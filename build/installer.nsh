!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var CrewBackgroundCheckbox
Var CrewStartupCheckbox
Var CrewLockCheckbox
Var CrewMinimizedCheckbox
Var CrewBackgroundValue
Var CrewStartupValue
Var CrewLockValue
Var CrewMinimizedValue

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
  ${NSD_CreateCheckbox} 0 62u 100% 18u "Keep notifications and calls active after I close the window"
  Pop $CrewBackgroundCheckbox
  ${NSD_Check} $CrewBackgroundCheckbox
  SetCtlColors $CrewBackgroundCheckbox "EAF8FF" "071225"
  ${NSD_CreateCheckbox} 0 88u 100% 18u "Start CrewDeck when I sign in to Windows"
  Pop $CrewStartupCheckbox
  SetCtlColors $CrewStartupCheckbox "EAF8FF" "071225"
  ${NSD_CreateCheckbox} 0 114u 100% 18u "Open CrewDeck minimized when Windows starts"
  Pop $CrewMinimizedCheckbox
  SetCtlColors $CrewMinimizedCheckbox "EAF8FF" "071225"
  ${NSD_CreateCheckbox} 0 140u 100% 18u "Help me configure an app-lock PIN on first launch"
  Pop $CrewLockCheckbox
  SetCtlColors $CrewLockCheckbox "EAF8FF" "071225"
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
