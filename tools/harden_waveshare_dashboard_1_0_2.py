from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
MODEL = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


services = SERVICES.read_text()
model = MODEL.read_text()

# 1.0.2 is intentionally a dashboard-correctness release.
model = replace_once(model, 'static constexpr char FW_VERSION[] = "1.0.1";',
                     'static constexpr char FW_VERSION[] = "1.0.2";', "firmware version")

# Clean a duplicate include introduced during 1.0.1 updater hardening.
services = services.replace('#include <esp_heap_caps.h>\n#include <esp_heap_caps.h>\n', '#include <esp_heap_caps.h>\n')

# Eliminate invalid nested forms inside the long /settings form. Keep native HTML
# submission semantics by using submit buttons with formaction/formmethod.
old = "s += F(\"</div><div class='grid'><form method='post' action='/bambu/pause'><button class='muted'>Pause</button></form><form method='post' action='/bambu/resume'><button>Resume</button></form><form method='post' action='/bambu/stop'><input name='confirm' placeholder='Type STOP to confirm'><button class='danger'>Stop print</button></form></div>\");"
new = "s += F(\"</div><div class='grid'><button type='submit' class='muted' formaction='/bambu/pause' formmethod='post' formnovalidate>Pause</button><button type='submit' formaction='/bambu/resume' formmethod='post' formnovalidate>Resume</button><div><input name='confirm' placeholder='Type STOP to confirm'><button type='submit' class='danger' formaction='/bambu/stop' formmethod='post' formnovalidate data-confirm='Stop the active print?'>Stop print</button></div></div>\");"
services = replace_once(services, old, new, "Bambu pause/resume/stop forms")

old = "s += F(\"</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>\");"
new = "s += F(\"</div><button type='submit' class='muted' formaction='/bambu/scan' formmethod='post' formnovalidate>Scan local network for Bambu printers</button>\");"
services = replace_once(services, old, new, "Bambu scan form")

# Discovered-printer cards used one nested form per result. Convert the card to a
# div and carry the selected index on the submit button itself.
old = "s += F(\"<form method='post' action='/bambu/use' class='card' style='margin:6px 0'><input type='hidden' name='index' value='\"); s += i; s += F(\"'><strong>\");"
new = "s += F(\"<div class='card' style='margin:6px 0'><strong>\");"
services = replace_once(services, old, new, "Bambu discovered card opening")

old = "s += F(\"</p><button type='submit'>\"); s += d->candidateOnly ? F(\"Use candidate IP\") : F(\"Use this printer\"); s += F(\"</button></form>\");"
new = "s += F(\"</p><button type='submit' name='index' value='\"); s += i; s += F(\"' formaction='/bambu/use' formmethod='post' formnovalidate>\"); s += d->candidateOnly ? F(\"Use candidate IP\") : F(\"Use this printer\"); s += F(\"</button></div>\");"
services = replace_once(services, old, new, "Bambu discovered card closing")

# Add explicit confirmation to Wi-Fi forget. This remains a standalone valid form.
services = replace_once(
    services,
    "<form method='post' action='/wifi/forget'><button class='danger'>Forget Wi-Fi</button></form>",
    "<form method='post' action='/wifi/forget'><button class='danger' data-confirm='Forget the saved Wi-Fi network?'>Forget Wi-Fi</button></form>",
    "Wi-Fi forget confirmation",
)

# Add confirmation to dryer stop. (This form is outside the settings form.)
services = replace_once(
    services,
    "<form method='post' action='/dryer/stop'><button class='danger'>Stop dryer</button></form>",
    "<form method='post' action='/dryer/stop'><button class='danger' data-confirm='Stop the active dryer timer?'>Stop dryer</button></form>",
    "dryer stop confirmation",
)

# Expose OTA total and percent so the dashboard can report meaningful progress.
old = '    doc["ota"]["bytes"] = state_->system.otaBytes;\n    doc["ota"]["status"] = state_->system.otaStatus;'
new = '    doc["ota"]["bytes"] = state_->system.otaBytes;\n    doc["ota"]["total"] = state_->system.otaTotal;\n    doc["ota"]["percent"] = state_->system.otaTotal ? (uint32_t)((uint64_t)state_->system.otaBytes * 100ULL / state_->system.otaTotal) : 0;\n    doc["ota"]["status"] = state_->system.otaStatus;'
services = replace_once(services, old, new, "OTA status telemetry")

# Replace fixed 5-second polling with adaptive polling. OTA gets a fast cadence;
# hidden tabs back off to reduce unnecessary work; unreachable devices retry slowly.
old = "sync();setInterval(sync,5000);document.querySelectorAll(\"form[action='/update/check'],form[action='/update/install']\")"
new = "let syncTimer=0,lastState=null;const scheduleSync=(delay)=>{clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{const d=await sync();if(d)lastState=d;const ota=d&&d.ota&&d.ota.inProgress;const next=ota?1000:(document.hidden?30000:(d?5000:15000));scheduleSync(next)},delay)};sync().then(d=>{if(d)lastState=d;scheduleSync(5000)});document.addEventListener('visibilitychange',()=>scheduleSync(document.hidden?30000:250));document.addEventListener('submit',e=>{const b=e.submitter;if(!b)return;const msg=b.dataset.confirm;if(msg&&!window.confirm(msg)){e.preventDefault();return}if(b.dataset.locked==='1'){e.preventDefault();return}if(b.classList.contains('danger')||b.formAction.endsWith('/update/install')){b.dataset.locked='1';setTimeout(()=>{b.disabled=true},0)}},true);document.querySelectorAll(\"form[action='/update/check'],form[action='/update/install']\")"
services = replace_once(services, old, new, "adaptive polling / critical action guard")

# Show progress in the live OTA line when the API exposes a total.
old = "set('liveOta',d.updater.error?d.updater.error:(d.updater.status||'Idle'));"
new = "const otaPct=d.ota&&d.ota.total?Math.min(100,Math.round((d.ota.bytes||0)*100/d.ota.total)):0;set('liveOta',d.ota&&d.ota.inProgress?(d.ota.status+' • '+otaPct+'%'):(d.updater.error?d.updater.error:(d.updater.status||'Idle')));"
services = replace_once(services, old, new, "live OTA progress")

# Static regression guard: after the outer /settings form opens, there must not be
# another literal form opening until its closing </form>. This catches exactly the
# browser-invalid condition that caused Safari-dependent behavior.
start = services.find("<form method='post' action='/settings'>")
if start < 0:
    raise SystemExit("settings form opening not found")
end = services.find("</form>", start)
if end < 0:
    raise SystemExit("settings form closing not found")
region = services[start:end]
forms = region.count("<form")
if forms != 1:
    offenders = re.findall(r"<form[^>]*>", region)
    raise SystemExit(f"nested form regression: found {forms} form openings in settings form: {offenders}")

SERVICES.write_text(services)
MODEL.write_text(model)
print("Applied Waveshare Home 1.0.2 dashboard hardening")
print("- firmware version 1.0.2")
print("- no nested forms inside /settings")
print("- confirmations/action locking")
print("- adaptive polling")
print("- OTA total/percent telemetry")
