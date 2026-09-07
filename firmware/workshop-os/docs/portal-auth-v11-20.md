# Workshop OS v11.20 Portal Auth RC1

## Purpose

Restore normal WS350 portal-code/session authentication now that the accepted v11.19.1 physical UI/recovery baseline is proven, while keeping **deliberate Recovery Safe Mode** and touch safety independent from the browser login path.

## Security delta

- removes `SMART_HOME_DEV_UNLOCK` from the reconstructed WS350 build;
- removes the development authorization short-circuit from `security_manager.cpp`;
- requires the boot-scoped portal-code cookie for normal LAN routes;
- protects the Recovery page itself on normal LAN, not only its mutations;
- does not print the rotating portal credential to Serial/log output;
- retains same-origin checks for mutating browser requests;
- removes the blanket `if (isAPMode()) return true` authorization policy;
- limits ordinary setup/fallback AP unauthenticated access to captive onboarding essentials;
- permits independent unauthenticated recovery only in deliberate Recovery Safe Mode and only for dedicated recovery/status/actions plus application OTA/factory reset;
- keeps printer control, mapped printer power, settings export, debug and unrelated privileged routes protected during ordinary AP fallback;
- allows portal-code login while on AP when authenticated access to protected surfaces is required;
- retains forced-safe WS350 touchscreen behavior;
- removes development-unlocked browser/recovery copy and stale historical security branding;
- keeps the current rotating portal code visible only where intentionally needed on the physical System screen.

## AP trust boundary

The pinned upstream BambuHelper baseline uses the static setup/fallback AP password `bambu1234`. That password is useful for captive onboarding but must **not** become an implicit Workshop OS administrator credential.

v11.20 therefore distinguishes three states:

1. **Normal LAN / STA** — portal-code session required for protected routes.
2. **Ordinary first-boot or fallback AP** — only the captive setup surface, Wi-Fi save path and required static assets are public. Protected printer/admin routes still require a valid portal-code session.
3. **Recovery Safe Mode AP** — dedicated recovery routes, application OTA and factory reset remain independently reachable for anti-lockout recovery. Other privileged routes remain protected.

The login route remains reachable on AP so an owner who can read the physical System code can establish a normal authenticated session when broader protected access is needed.

## CI acceptance

- [ ] v11.19.1 accepted baseline reconstructs cleanly.
- [ ] v11.19.1 physical-fit/render contracts remain green before auth delta.
- [ ] v11.20 auth patch applies exactly once.
- [ ] `SMART_HOME_DEV_UNLOCK` is absent from the candidate build.
- [ ] development auth bypass code/copy is absent.
- [ ] portal credential is absent from Serial logging calls.
- [ ] login GET/POST routes remain present on STA and AP.
- [ ] normal root/status/control/capture routes remain secured.
- [ ] normal-LAN `/recovery` uses the secure GET wrapper.
- [ ] same-origin protection remains present for mutations.
- [ ] blanket AP authorization bypass is absent.
- [ ] ordinary AP public access is limited to onboarding essentials.
- [ ] Recovery Safe Mode public access is route-scoped to recovery/OTA/reset surfaces.
- [ ] settings export, printer control, printer power and debug are not anonymously allowlisted on AP.
- [ ] recovery mutation guard remains present.
- [ ] WS350 physical portal-code card remains present.
- [ ] forced-safe FT6336 touch contract remains present.
- [ ] browser JavaScript parses.
- [ ] native `ws_lcd_350` build passes.
- [ ] shared `jc3248w535` regression build passes.
- [ ] Full-image merge and OTA packaging pass.

## Physical acceptance on WS350

Use only the exact CI artifact for this candidate.

1. **Before OTA**
   - photograph/record current v11.19.1 System screen and portal access without sharing the live code;
   - confirm printer settings, Wi-Fi, touch, Recovery and current known-good slot are healthy.
2. **OTA candidate**
   - install the v11.20 application/OTA image, not Full.bin;
   - verify device returns to Home and printer configuration persists.
3. **Login gate**
   - open the device LAN URL in a fresh/private browser session;
   - verify redirect to the custom `/login` page;
   - verify no browser-native HTTP-auth dialog appears;
   - enter a wrong code and confirm rejection;
   - enter the current code shown under **System → Portal Access** and confirm login.
4. **Session behavior**
   - navigate Home/Printer/Workshop/Tools/System browser surfaces after login;
   - verify Light, Pause/Resume, guarded Stop and mapped Power remain callable as applicable;
   - use Logout and confirm access is gated again;
   - log in again, reboot the device, and confirm the old session no longer grants access and the displayed code changes.
5. **Credential/log handling**
   - inspect normal boot serial output and verify the portal code itself is not printed;
   - verify the physical System screen still shows the current code for the owner;
   - do not include the displayed code in shared screenshots, diagnostics or support artifacts.
6. **Mutation protection**
   - verify normal browser saves/controls work after login;
   - verify an unauthenticated control request fails rather than executing;
   - verify Same-Origin protection remains active for mutating requests.
7. **Ordinary AP fallback boundary**
   - enter or induce ordinary setup/fallback AP mode without deliberately entering Recovery Safe Mode;
   - verify captive Wi-Fi onboarding still renders and Wi-Fi credentials can be saved;
   - verify printer-control, mapped-power, debug, settings-export and other protected routes do **not** become anonymously available simply because AP mode is active;
   - open `/login`, enter the current physical System code, and verify a valid session can still unlock protected surfaces when needed.
8. **Recovery independence**
   - while on normal LAN and signed out, request `/recovery` and verify it redirects to `/login` rather than exposing the recovery page;
   - sign in and verify `/recovery` renders independently of the normal portal JavaScript;
   - on normal LAN, verify recovery mutations require the authenticated portal session;
   - deliberately enter Recovery Safe Mode/AP and verify `/recovery` remains directly accessible without the normal LAN session;
   - verify Recovery Safe Mode/AP permits intended recovery status/actions, application OTA and factory reset without the normal LAN session;
   - verify unrelated printer/admin routes remain protected even in Recovery Safe Mode;
   - verify Force Touchscreen, reset UI, reboot and rollback paths remain available as designed.
9. **OTA/recovery regression**
   - perform one authenticated manual OTA/reinstall or subsequent candidate update path;
   - verify Safari-compatible hashing/upload behavior and reboot return;
   - confirm known-good/rollback metadata remains healthy.
10. **Physical UI regression**
   - verify touch remains responsive after cold boot and OTA reboot;
   - verify the System portal-code card fits and is readable;
   - verify no v11.19.1 rendered-fit regression on the accepted 22-view set.
11. **Credential-safe visual capture**
   - run the supported 22-view capture helper;
   - verify raw framebuffer bytes are never retained in the capture directory;
   - verify the retained System PPM and PNG both have the live portal-code region redacted;
   - verify no printer configuration or settings export is included;
   - interrupt one test capture and confirm terminal echo is restored and no raw credential-bearing framebuffer remains in the retained folder.

## Promotion gate

Do not merge/promote v11.20 solely because CI is green. Physical login, credential/log handling, reboot/session invalidation, ordinary AP scoping, normal-LAN Recovery gating, OTA, deliberate Recovery Safe Mode behavior, capture hygiene and touch/control regressions must be demonstrated on the actual WS350 first.
