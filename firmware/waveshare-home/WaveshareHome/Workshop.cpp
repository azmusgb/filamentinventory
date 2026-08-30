#include "Workshop.h"
#include <string.h>

namespace {
void copyWs(char *dst, size_t size, const char *src) {
  if (!dst || size == 0) return;
  strlcpy(dst, src ? src : "", size);
}
}

const char *airModeName(AirMode mode) {
  switch (mode) {
    case AirMode::Manual: return "Manual";
    case AirMode::Auto: return "Auto";
    case AirMode::PostPrint: return "Post-print";
    default: return "Off";
  }
}

const char *ambientModeName(AmbientDisplayMode mode) {
  switch (mode) {
    case AmbientDisplayMode::Clock: return "Clock";
    case AmbientDisplayMode::Printer: return "Printer";
    case AmbientDisplayMode::Workshop: return "Workshop";
    case AmbientDisplayMode::Minimal: return "Minimal";
    default: return "Auto";
  }
}

void WorkshopService::begin(AppConfig &config, AppState &state) {
  state.workshop.enabled = config.workshopEnabled;
  state.workshop.airMode = config.airMode;
  state.workshop.sensorConfigured = config.workshopSensorEnabled;
  state.workshop.presenceConfigured = config.presenceEnabled;
  state.workshop.dryerConfigured = config.dryerEnabled;
  lastPrinting_ = state.printer.printing;
  lastPresence_ = state.workshop.environment.presence;
}

void WorkshopService::loop(AppConfig &config, AppState &state) {
  state.workshop.enabled = config.workshopEnabled;
  if (!config.workshopEnabled) return;

  if (state.workshop.dryer.running) {
    uint32_t elapsed = (millis() - state.workshop.dryer.startedMs) / 1000UL;
    if (elapsed >= state.workshop.dryer.durationSec) {
      state.workshop.dryer.running = false;
      state.workshop.dryer.remainingSec = 0;
      state.workshop.dryer.completed = true;
    } else {
      state.workshop.dryer.remainingSec = state.workshop.dryer.durationSec - elapsed;
    }
  }

  if (config.airMode == AirMode::Auto) {
    if (state.printer.printing) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Printer active");
    } else if (state.workshop.environment.pm25 >= config.pm25Alert || state.workshop.environment.voc >= config.vocAlert) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Air quality elevated");
    } else if (lastPrinting_ && !state.printer.printing) {
      state.workshop.postFilterUntilMs = millis() + config.postPrintFilterMinutes * 60000UL;
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Post-print filtration");
    } else if ((int32_t)(state.workshop.postFilterUntilMs - millis()) > 0) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Post-print filtration");
    } else {
      state.workshop.filterRequested = false;
      state.workshop.filterReason[0] = '\0';
    }
  } else if (config.airMode == AirMode::Off) {
    state.workshop.filterRequested = false;
    state.workshop.filterReason[0] = '\0';
  }

  state.workshop.environment.stale = state.workshop.environment.updatedMs == 0 || millis() - state.workshop.environment.updatedMs > 180000UL;
  lastPrinting_ = state.printer.printing;
  lastPresence_ = state.workshop.environment.presence;
}

void WorkshopService::ingestSensor(AppState &state, const char *source, float temperatureC, float humidity,
                                   float pm25, float voc, float co2, bool presence) {
  auto &e = state.workshop.environment;
  copyWs(e.source, sizeof(e.source), source && *source ? source : "External sensor");
  e.temperatureC = temperatureC;
  e.humidity = humidity;
  e.pm25 = pm25;
  e.voc = voc;
  e.co2 = co2;
  e.presence = presence;
  e.online = true;
  e.stale = false;
  e.updatedMs = millis();
}

void WorkshopService::startDryer(AppState &state, const char *material, uint16_t temperatureC, uint32_t durationSec) {
  auto &d = state.workshop.dryer;
  copyWs(d.material, sizeof(d.material), material && *material ? material : "Filament");
  d.targetC = temperatureC;
  d.durationSec = durationSec;
  d.remainingSec = durationSec;
  d.startedMs = millis();
  d.running = true;
  d.completed = false;
}

void WorkshopService::stopDryer(AppState &state) {
  state.workshop.dryer.running = false;
  state.workshop.dryer.remainingSec = 0;
}

void WorkshopService::setAirMode(AppState &state, AirMode mode) {
  state.workshop.airMode = mode;
}

void ActivityEngine::begin(AppState &state) {
  initialized_ = true;
  lastPrinterOnline_ = state.printer.online;
  lastPrinting_ = state.printer.printing;
  lastAlertCount_ = state.alertCount;
  lastDryerRunning_ = state.workshop.dryer.running;
  add(state, "System", "Waveshare Home started", FW_VERSION);
}

void ActivityEngine::add(AppState &state, const char *source, const char *title, const char *detail) {
  for (int i = 11; i > 0; --i) state.activity[i] = state.activity[i - 1];
  auto &a = state.activity[0];
  a.valid = true;
  a.epoch = time(nullptr);
  a.ms = millis();
  copyWs(a.source, sizeof(a.source), source);
  copyWs(a.title, sizeof(a.title), title);
  copyWs(a.detail, sizeof(a.detail), detail);
  if (state.activityCount < 12) state.activityCount++;
}

void ActivityEngine::loop(AppState &state) {
  if (!initialized_) begin(state);
  if (state.printer.online != lastPrinterOnline_) {
    add(state, "Printer", state.printer.online ? "Printer connected" : "Printer offline", state.printer.displayName);
    lastPrinterOnline_ = state.printer.online;
  }
  if (state.printer.printing != lastPrinting_) {
    add(state, "Printer", state.printer.printing ? "Print started" : "Print stopped", state.printer.jobName);
    lastPrinting_ = state.printer.printing;
  }
  if (state.alertCount != lastAlertCount_) {
    if (state.alertCount > lastAlertCount_ && state.alertCount > 0) add(state, "Attention", state.alerts[0].title, state.alerts[0].detail);
    else if (state.alertCount == 0) add(state, "Attention", "All alerts cleared", "");
    lastAlertCount_ = state.alertCount;
  }
  if (state.workshop.dryer.running != lastDryerRunning_) {
    add(state, "Dryer", state.workshop.dryer.running ? "Drying started" : (state.workshop.dryer.completed ? "Drying complete" : "Drying stopped"), state.workshop.dryer.material);
    lastDryerRunning_ = state.workshop.dryer.running;
  }
}
