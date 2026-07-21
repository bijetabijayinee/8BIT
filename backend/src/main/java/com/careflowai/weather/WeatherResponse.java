package com.careflowai.weather;

/** Minimal current-conditions payload the top-bar clock/weather widget needs. */
public record WeatherResponse(int temperature, int weatherCode, boolean isDay) {
}
