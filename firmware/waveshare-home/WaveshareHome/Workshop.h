#pragma once

#include <Arduino.h>
#include "AppModel.h"

class WorkshopService {
public:
  void begin(AppConfig &config, AppState &state);
  void loop(AppConfig &config, AppState &state);
  void ingestSensor(AppState &state, const char *source, float temperatureC, float humidity,
                    float pm25, float voc, float co2, bool presence);
  void startDryer(AppState &state, const char *material, uint16_t temperatureC, uint32_t durationSec);
  void stopDryer(AppState &state);
  void setAirMode(AppState &state, AirMode mode);
private:
  bool lastPrinting_ = false;
  bool lastPresence_ = false;
  uint32_t lastDerivedMs_ = 0;
};

class ActivityEngine {
public:
  void begin(AppState &state);
  void loop(AppState &state);
  void add(AppState &state, const char *source, const char *title, const char *detail = "");
private:
  bool initialized_ = false;
  bool lastPrinterOnline_ = false;
  bool lastPrinting_ = false;
  uint8_t lastAlertCount_ = 0;
  bool lastDryerRunning_ = false;
};

const char *airModeName(AirMode mode);
const char *ambientModeName(AmbientDisplayMode mode);
