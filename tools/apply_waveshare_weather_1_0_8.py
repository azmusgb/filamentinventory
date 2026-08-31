from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
HDR = ROOT / "firmware/waveshare-home/WaveshareHome/Services.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
INO = ROOT / "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


app = APP.read_text()
app = replace_once(app,
    'static constexpr char FW_VERSION[] = "1.0.7";',
    'static constexpr char FW_VERSION[] = "1.0.8";',
    'firmware version')
app = replace_once(app,
'''struct WeatherState {
  bool configured = false;
  bool online = false;
  float temperatureC = 0;
  float apparentC = 0;
  float highC = 0;
  float lowC = 0;
  int precipitationPercent = 0;
  int weatherCode = -1;
  char condition[32] = "Not configured";
  bool severeAlert = false;
  char alertSeverity[20] = "";
  char alertHeadline[120] = "";
  uint32_t updatedMs = 0;
};''',
'''struct WeatherState {
  bool configured = false;
  bool online = false;
  bool locationResolved = false;
  float temperatureC = 0;
  float apparentC = 0;
  float highC = 0;
  float lowC = 0;
  float humidityPercent = 0;
  float precipitationMm = 0;
  float windKph = 0;
  float windGustKph = 0;
  int windDirectionDegrees = 0;
  int precipitationPercent = 0;
  int weatherCode = -1;
  char condition[32] = "Not configured";
  char locationName[64] = "";
  char lastError[96] = "";
  bool severeAlert = false;
  char alertSeverity[20] = "";
  char alertHeadline[120] = "";
  uint32_t updatedMs = 0;
};''',
    'WeatherState')
APP.write_text(app)

hdr = HDR.read_text()
hdr = replace_once(hdr,
'''  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;

private:''',
'''  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
  static bool resolveLocationNow(AppConfig &config) { return resolveLocation(config); }

private:''',
    'weather public resolver')
hdr = replace_once(hdr,
'''  static bool hasCoordinates(const AppConfig &config) {
    return fabsf(config.weatherLatitude) > 0.0001f || fabsf(config.weatherLongitude) > 0.0001f;
  }''',
'''  static bool hasCoordinates(const AppConfig &config) {
    return isfinite(config.weatherLatitude) && isfinite(config.weatherLongitude) &&
           config.weatherLatitude >= -90.0f && config.weatherLatitude <= 90.0f &&
           config.weatherLongitude >= -180.0f && config.weatherLongitude <= 180.0f &&
           (fabsf(config.weatherLatitude) > 0.0001f || fabsf(config.weatherLongitude) > 0.0001f);
  }''',
    'coordinate validation')
hdr = replace_once(hdr,
'''    if (!http.begin(secure, url)) return false;
    http.addHeader("User-Agent", "WaveshareHome/1.0 ESP32 weather location resolver");
    http.addHeader("Accept", "application/json");

    const int code = http.GET();''',
'''    if (!http.begin(secure, url)) return false;
    http.addHeader("User-Agent", "WaveshareHome/1.0.8 (https://github.com/azmusgb/filamentinventory)");
    http.addHeader("Accept", "application/json");
    http.addHeader("Accept-Language", "en-US,en;q=0.8");
    http.addHeader("Accept-Encoding", "identity");

    esp_task_wdt_reset();
    delay(0);
    const int code = http.GET();
    esp_task_wdt_reset();
    delay(0);''',
    'resolver request')
HDR.write_text(hdr)

cpp = CPP.read_text()
cpp = replace_once(cpp,
'''void WeatherPlugin::begin(AppConfig &config, AppState &state) {
  state.weather.configured = config.weatherEnabled &&
    (fabsf(config.weatherLatitude) > 0.0001f || fabsf(config.weatherLongitude) > 0.0001f);
  state.weather.online = false;
  lastFetchMs_ = 0;
  lastAlertFetchMs_ = 0;
}''',
'''void WeatherPlugin::begin(AppConfig &config, AppState &state) {
  state.weather.configured = config.weatherEnabled && hasCoordinates(config);
  state.weather.online = false;
  state.weather.locationResolved = state.weather.configured;
  state.weather.lastError[0] = '\\0';
  if (!config.weatherEnabled) {
    copyText(state.weather.condition, sizeof(state.weather.condition), "Off");
  } else if (state.weather.configured) {
    copyText(state.weather.condition, sizeof(state.weather.condition), "Refreshing weather...");
    copyText(state.weather.locationName, sizeof(state.weather.locationName),
             strlen(config.weatherLocation) ? config.weatherLocation : "Manual coordinates");
  } else if (strlen(config.weatherLocation)) {
    copyText(state.weather.condition, sizeof(state.weather.condition), "Resolving location...");
  } else {
    copyText(state.weather.condition, sizeof(state.weather.condition), "Enter ZIP or City, State");
  }
  lastFetchMs_ = 0;
  lastAlertFetchMs_ = 0;
}''',
    'WeatherPlugin begin')
cpp = replace_once(cpp,
'''void WeatherPlugin::fetchWeather(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  String url = "https://api.open-meteo.com/v1/forecast?latitude=" + String(config.weatherLatitude, 5) +
    "&longitude=" + String(config.weatherLongitude, 5) +
    "&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto";
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, url)) return;
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getStream())) {
      state.weather.temperatureC = doc["current"]["temperature_2m"] | 0.0f;
      state.weather.apparentC = doc["current"]["apparent_temperature"] | 0.0f;
      state.weather.weatherCode = doc["current"]["weather_code"] | -1;
      state.weather.highC = doc["daily"]["temperature_2m_max"][0] | 0.0f;
      state.weather.lowC = doc["daily"]["temperature_2m_min"][0] | 0.0f;
      state.weather.precipitationPercent = doc["daily"]["precipitation_probability_max"][0] | 0;
      copyText(state.weather.condition, sizeof(state.weather.condition), weatherCodeText(state.weather.weatherCode));
      state.weather.online = true;
      state.weather.updatedMs = millis();
    }
  } else {
    state.weather.online = false;
  }
  http.end();
}''',
'''void WeatherPlugin::fetchWeather(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  state.weather.lastError[0] = '\\0';
  String url = "https://api.open-meteo.com/v1/forecast?latitude=" + String(config.weatherLatitude, 5) +
    "&longitude=" + String(config.weatherLongitude, 5) +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto";
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, url)) {
    state.weather.online = false;
    copyText(state.weather.lastError, sizeof(state.weather.lastError), "Could not open Open-Meteo forecast endpoint");
    return;
  }
  http.addHeader("User-Agent", "WaveshareHome/1.0.8 ESP32-S3");
  http.addHeader("Accept", "application/json");
  http.addHeader("Accept-Encoding", "identity");
  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, http.getStream());
    if (!error && !doc["current"].isNull() && !doc["daily"].isNull()) {
      state.weather.temperatureC = doc["current"]["temperature_2m"] | 0.0f;
      state.weather.apparentC = doc["current"]["apparent_temperature"] | 0.0f;
      state.weather.humidityPercent = doc["current"]["relative_humidity_2m"] | 0.0f;
      state.weather.precipitationMm = doc["current"]["precipitation"] | 0.0f;
      state.weather.windKph = doc["current"]["wind_speed_10m"] | 0.0f;
      state.weather.windGustKph = doc["current"]["wind_gusts_10m"] | 0.0f;
      state.weather.windDirectionDegrees = doc["current"]["wind_direction_10m"] | 0;
      state.weather.weatherCode = doc["current"]["weather_code"] | -1;
      state.weather.highC = doc["daily"]["temperature_2m_max"][0] | 0.0f;
      state.weather.lowC = doc["daily"]["temperature_2m_min"][0] | 0.0f;
      state.weather.precipitationPercent = constrain((int)(doc["daily"]["precipitation_probability_max"][0] | 0), 0, 100);
      copyText(state.weather.condition, sizeof(state.weather.condition), weatherCodeText(state.weather.weatherCode));
      copyText(state.weather.locationName, sizeof(state.weather.locationName),
               strlen(config.weatherLocation) ? config.weatherLocation : "Manual coordinates");
      state.weather.configured = true;
      state.weather.locationResolved = true;
      state.weather.online = true;
      state.weather.updatedMs = millis();
    } else {
      state.weather.online = false;
      String message = String("Forecast JSON error: ") + (error ? error.c_str() : "missing current/daily data");
      copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
    }
  } else {
    state.weather.online = false;
    String message = String("Open-Meteo HTTP ") + code;
    copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
  }
  http.end();
}''',
    'weather fetch')
cpp = replace_once(cpp,
'''  if (!beginHttp(http, secure, url)) return;
  http.addHeader("User-Agent", "WaveshareHome/1.0 (ESP32 Home Hub)");
  http.addHeader("Accept", "application/geo+json");
  int code = http.GET();''',
'''  if (!beginHttp(http, secure, url)) {
    copyText(state.weather.lastError, sizeof(state.weather.lastError), "Could not open NWS alerts endpoint");
    return;
  }
  http.addHeader("User-Agent", "WaveshareHome/1.0.8 (https://github.com/azmusgb/filamentinventory)");
  http.addHeader("Accept", "application/geo+json");
  http.addHeader("Accept-Encoding", "identity");
  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);''',
    'NWS request')
cpp = replace_once(cpp,
'''    const String latArg = server_.arg("weatherLat");
    const String lonArg = server_.arg("weatherLon");
    if (location != previousLocation) {
      config_->weatherLatitude = 0.0f;
      config_->weatherLongitude = 0.0f;
    }
    if (latArg.length() && lonArg.length()) {
      config_->weatherLatitude = latArg.toFloat();
      config_->weatherLongitude = lonArg.toFloat();
    }

    state_->weather.online = false;
    if (!config_->weatherEnabled) {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Off");
    } else if ((fabsf(config_->weatherLatitude) > 0.0001f || fabsf(config_->weatherLongitude) > 0.0001f)) {
      state_->weather.configured = true;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Saved; refreshing weather");
    } else if (strlen(config_->weatherLocation)) {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Resolving location...");
    } else {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Enter ZIP or City, State");
    }

    store_.save(*config_);''',
'''    const String latArg = server_.arg("weatherLat");
    const String lonArg = server_.arg("weatherLon");
    if (location != previousLocation) {
      config_->weatherLatitude = 0.0f;
      config_->weatherLongitude = 0.0f;
    }
    if (latArg.length() && lonArg.length()) {
      config_->weatherLatitude = latArg.toFloat();
      config_->weatherLongitude = lonArg.toFloat();
    }

    state_->weather.online = false;
    state_->weather.lastError[0] = '\\0';
    if (!config_->weatherEnabled) {
      state_->weather.configured = false;
      state_->weather.locationResolved = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Off");
    } else if ((fabsf(config_->weatherLatitude) > 0.0001f || fabsf(config_->weatherLongitude) > 0.0001f)) {
      state_->weather.configured = true;
      state_->weather.locationResolved = true;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Saved; refreshing weather");
    } else if (strlen(config_->weatherLocation) && server_.arg("resolve") == "1") {
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Resolving location...");
      if (WeatherPlugin::resolveLocationNow(*config_)) {
        state_->weather.configured = true;
        state_->weather.locationResolved = true;
        copyText(state_->weather.locationName, sizeof(state_->weather.locationName), config_->weatherLocation);
        copyText(state_->weather.condition, sizeof(state_->weather.condition), "Location resolved; refreshing weather");
      } else {
        state_->weather.configured = false;
        state_->weather.locationResolved = false;
        copyText(state_->weather.condition, sizeof(state_->weather.condition), "Location lookup failed");
        copyText(state_->weather.lastError, sizeof(state_->weather.lastError), "Could not resolve ZIP or City, State. Check spelling or use manual coordinates.");
      }
    } else if (strlen(config_->weatherLocation)) {
      state_->weather.configured = false;
      state_->weather.locationResolved = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Saved; location will resolve automatically");
    } else {
      state_->weather.configured = false;
      state_->weather.locationResolved = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Enter ZIP or City, State");
    }

    store_.save(*config_);''',
    'weather save route')
cpp = replace_once(cpp,
'''  config_->weatherEnabled = server_.hasArg("weatherEnabled");
  config_->severeWeatherEnabled = server_.hasArg("weatherAlerts");
  config_->weatherLatitude = server_.arg("weatherLat").toFloat();
  config_->weatherLongitude = server_.arg("weatherLon").toFloat();
  copyText(config_->weatherLocation, sizeof(config_->weatherLocation), server_.arg("weatherLocation"));''',
'''  config_->weatherEnabled = server_.hasArg("weatherEnabled");
  config_->severeWeatherEnabled = server_.hasArg("weatherAlerts");
  const String previousWeatherLocation = config_->weatherLocation;
  const float previousWeatherLat = config_->weatherLatitude;
  const float previousWeatherLon = config_->weatherLongitude;
  const String weatherLocationArg = server_.arg("weatherLocation");
  const String weatherLatArg = server_.arg("weatherLat");
  const String weatherLonArg = server_.arg("weatherLon");
  copyText(config_->weatherLocation, sizeof(config_->weatherLocation), weatherLocationArg);
  if (weatherLatArg.length() && weatherLonArg.length()) {
    config_->weatherLatitude = weatherLatArg.toFloat();
    config_->weatherLongitude = weatherLonArg.toFloat();
  } else if (weatherLocationArg == previousWeatherLocation) {
    // Do not erase coordinates that were resolved and persisted by the dedicated
    // Weather form merely because the general Settings form leaves advanced
    // latitude/longitude inputs blank.
    config_->weatherLatitude = previousWeatherLat;
    config_->weatherLongitude = previousWeatherLon;
  } else {
    config_->weatherLatitude = 0.0f;
    config_->weatherLongitude = 0.0f;
  }''',
    'preserve weather coordinates')
cpp = replace_once(cpp,
'''  doc["weather"]["online"] = state_->weather.online;
  doc["weather"]["temperatureC"] = state_->weather.temperatureC;
  doc["weather"]["condition"] = state_->weather.condition;
  doc["weather"]["alert"] = state_->weather.severeAlert ? state_->weather.alertHeadline : "";''',
'''  doc["weather"]["enabled"] = config_->weatherEnabled;
  doc["weather"]["configured"] = state_->weather.configured;
  doc["weather"]["online"] = state_->weather.online;
  doc["weather"]["locationResolved"] = state_->weather.locationResolved;
  doc["weather"]["location"] = strlen(state_->weather.locationName) ? state_->weather.locationName : config_->weatherLocation;
  doc["weather"]["latitude"] = config_->weatherLatitude;
  doc["weather"]["longitude"] = config_->weatherLongitude;
  doc["weather"]["temperatureC"] = state_->weather.temperatureC;
  doc["weather"]["apparentC"] = state_->weather.apparentC;
  doc["weather"]["highC"] = state_->weather.highC;
  doc["weather"]["lowC"] = state_->weather.lowC;
  doc["weather"]["humidityPercent"] = state_->weather.humidityPercent;
  doc["weather"]["precipitationMm"] = state_->weather.precipitationMm;
  doc["weather"]["precipitationPercent"] = state_->weather.precipitationPercent;
  doc["weather"]["windKph"] = state_->weather.windKph;
  doc["weather"]["windGustKph"] = state_->weather.windGustKph;
  doc["weather"]["windDirectionDegrees"] = state_->weather.windDirectionDegrees;
  doc["weather"]["weatherCode"] = state_->weather.weatherCode;
  doc["weather"]["condition"] = state_->weather.condition;
  doc["weather"]["updatedMs"] = state_->weather.updatedMs;
  doc["weather"]["error"] = state_->weather.lastError;
  doc["weather"]["severeAlert"] = state_->weather.severeAlert;
  doc["weather"]["alertSeverity"] = state_->weather.alertSeverity;
  doc["weather"]["alert"] = state_->weather.severeAlert ? state_->weather.alertHeadline : "";''',
    'weather JSON')
cpp = replace_once(cpp,
'''s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label><p class='status'>Weather status: "); s += htmlEscape(state_->weather.condition); s += F("</p><div class='row'><button type='submit' formaction='/weather/save'>Save weather</button><button type='submit' formaction='/weather/save' name='resolve' value='1' class='muted'>Save & resolve now</button></div><hr>");''',
'''s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label><p class='status'>Weather status: "); s += htmlEscape(state_->weather.condition); if (strlen(state_->weather.lastError)) { s += F("<br><span class='warn'>"); s += htmlEscape(state_->weather.lastError); s += F("</span>"); } s += F("</p>"); if (state_->weather.online) { s += F("<div class='grid'><div><small>Now</small><div class='metric'>"); s += String(state_->weather.temperatureC * 9.0f / 5.0f + 32.0f, 0); s += F("°F</div><p>"); s += htmlEscape(state_->weather.condition); s += F(" • feels "); s += String(state_->weather.apparentC * 9.0f / 5.0f + 32.0f, 0); s += F("°</p></div><div><small>Today</small><div class='metric'>H "); s += String(state_->weather.highC * 9.0f / 5.0f + 32.0f, 0); s += F("° • L "); s += String(state_->weather.lowC * 9.0f / 5.0f + 32.0f, 0); s += F("°</div><p>Rain "); s += state_->weather.precipitationPercent; s += F("% • RH "); s += String(state_->weather.humidityPercent, 0); s += F("%</p></div><div><small>Wind</small><div class='metric'>"); s += String(state_->weather.windKph * 0.621371f, 0); s += F(" mph</div><p>Gusts "); s += String(state_->weather.windGustKph * 0.621371f, 0); s += F(" mph</p></div></div>"); } s += F("<div class='row'><button type='submit' formaction='/weather/save'>Save weather</button><button type='submit' formaction='/weather/save' name='resolve' value='1' class='muted'>Save & resolve now</button></div><hr>");''',
    'weather web card')
CPP.write_text(cpp)

ino = INO.read_text()
ino = replace_once(ino,
'''      snprintf(b,sizeof(b),"%.0f°F  %s\\nFeels %.0f° • H %.0f° / L %.0f°\\nPrecipitation %d%%",state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent);''',
'''      snprintf(b,sizeof(b),"%.0f°F  %s\\nFeels %.0f° • H %.0f° / L %.0f°\\nRain %d%% • RH %.0f%% • Wind %.0f mph",state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent,state.weather.humidityPercent,state.weather.windKph*0.621371f);''',
    'touch weather detail')
ino = replace_once(ino,
'''      snprintf(b,sizeof(b),"Weather temporarily unavailable\\nWi-Fi is %s • retrying automatically", WiFi.status()==WL_CONNECTED?"online":"offline");''',
'''      snprintf(b,sizeof(b),"Weather temporarily unavailable\\n%s", strlen(state.weather.lastError) ? state.weather.lastError : (WiFi.status()==WL_CONNECTED?"Online • retrying automatically":"Wi-Fi offline"));''',
    'touch weather error')
INO.write_text(ino)

print("Applied Waveshare Home 1.0.8 weather hardening")
