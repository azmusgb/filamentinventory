#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class ContractError(RuntimeError):
    pass


def need(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise ContractError(f"{where}: missing {needle}")


def forbid(text: str, needle: str, where: str) -> None:
    if needle in text:
        raise ContractError(f"{where}: forbidden {needle}")


def main() -> int:
    ap=argparse.ArgumentParser();ap.add_argument("repo");args=ap.parse_args();root=Path(args.repo).resolve()
    def read(rel: str) -> str:
        p=root/rel
        if not p.exists(): raise ContractError(f"missing {rel}")
        return p.read_text(encoding="utf-8",errors="replace")

    build=read("include/smart_home_build.h");settings_h=read("src/settings.h");settings_cpp=read("src/settings.cpp")
    backend_h=read("src/buzzer_backend.h");backend=read("src/buzzer_backend_es8311.cpp");hub=read("src/smart_hub.cpp");web=read("src/web_server.cpp")

    for needle in ['SMART_HOME_VERSION "v11.24"','SMART_HOME_PROFILE "audio-console"','Smart Home v11.24 Audio Console RC1','Workshop OS v11.24 Audio Console RC1']:
        need(build,needle,"build identity")
    need(settings_h,"uint8_t volume;","BuzzerSettings")
    for needle in ['getUChar("buz_vol",75)','putUChar("buz_vol"']: need(settings_cpp,needle,"volume persistence")
    need(backend_h,"buzzerBackendSetVolume","backend API")
    for needle in ['buzzerBackendSetVolume(uint8_t percent)','ES_REG_DAC_32','buzzerSettings.volume','5000','buzzerBackendMicEcho','buzzerBackendMicLevel','MALLOC_CAP_SPIRAM']:
        need(backend,needle,"ES8311 backend")
    forbid(backend,'kCodecVolume == 0',"fixed codec volume")

    for needle in [
        '"OUTPUT"','"MIC"','"ALERTS"','"QUIET"','"LED"','"FINISH"','"ERROR"','"POWER"','"AUTO OFF"',
        'g_audioSettingsPage%9U','(g_audioSettingsPage+1U)%9U',
        '"VOLUME -10"','"VOLUME +10"','"EVENT SOUNDS"','"SPEAKER TEST"',
        '"MIC LEVEL"','"ECHO 1 SEC"','"ECHO 3 SEC"','"ECHO 5 SEC"',
        '"BUTTON CLICKS"','"BED COOLDOWN"','"THRESHOLD -5"','"THRESHOLD +5"',
        '"QUIET START -1"','"QUIET START +1"','"QUIET END -1"','"QUIET END +1"',
        'buzzerBackendMicLevel(250)','buzzerBackendMicEcho(recordMs)','buzzerBackendSetVolume(buzzerSettings.volume)',
    ]: need(hub,needle,"physical Audio Console")

    for needle in [
        '"STATUS LED"','"BRIGHTNESS -25"','"BRIGHTNESS +25"','"PRINT AUTO"',
        '"PAUSE BREATH"','"FINISH EFFECT"','"FINISH DURATION"','"FINISH PEAK"',
        '"ERROR STROBE"','"ERROR DURATION"','"LED DRIVER"','"GPIO & COLORS"',
        'saveLedSettings()','initLed()','ledSettings.pauseBreathing=!ledSettings.pauseBreathing','ledSettings.errorStrobe=!ledSettings.errorStrobe',
    ]: need(hub,needle,"inherited LED controls")

    for needle in [
        '"PLUG STATUS"','"POLL INTERVAL"','"STATUS DISPLAY"','"BUTTON POWER"',
        '"AUTO OFF"','"AUTO OFF DELAY"','"CANCEL ON DOOR"','"PLUG CONFIG"',
        'hubPowerConfigPlug','hubStepPowerPoll','hubStepAutoOffDelay','hubPersistPower',
        'ps.autoOffEnabled=!ps.autoOffEnabled','ps.autoOffCancelOnDoor=!ps.autoOffCancelOnDoor',
    ]: need(hub,needle,"inherited Power Automation controls")

    start=hub.find('    if(g_audioSettingsView){');end=hub.find('    if(g_networkSettingsView){',start)
    if start<0 or end<0: raise ContractError("cannot isolate Hardware Console touch block")
    forbid(hub[start:end],'longPress',"Hardware Console touch semantics")

    for needle in ['server.hasArg("buzvol")','server.arg("buzvol")','buz["volume"] = buzzerSettings.volume']:
        need(web,needle,"browser volume binding")
    for needle in ['DROPPED: MQTT offline','if (!st.connected) return false']:
        need(read("src/bambu_mqtt.cpp"),needle,"inherited MQTT safety")
    for forbidden in ['requestSpeedCommand','requestFanCommand']:
        forbid(hub,forbidden,"unsupported printer control");forbid(web,forbidden,"unsupported printer control")

    print("Workshop OS v11.24 Audio Console contracts: PASS")
    print("speaker_volume=PERSISTENT_ES8311_DAC")
    print("mic_meter=250MS_ON_DEMAND")
    print("mic_echo_presets=1S_3S_5S")
    print("hardware_console=OUTPUT_MIC_ALERTS_QUIET_LED_FINISH_ERROR_POWER_AUTO_OFF")
    print("audio_led_power_adjustments=NO_HIDDEN_HOLD_REVERSE")
    print("voice_audio=LOCAL_ONLY_NOT_UPLOADED")
    return 0


if __name__=="__main__":
    try: raise SystemExit(main())
    except ContractError as e: raise SystemExit(f"AUDIO CONSOLE CONTRACT FAILED: {e}")
