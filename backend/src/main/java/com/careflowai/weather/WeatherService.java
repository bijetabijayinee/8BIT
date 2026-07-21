package com.careflowai.weather;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-side proxy to the keyless Open-Meteo API. The browser never contacts a
 * third-party weather domain directly - it only ever calls this backend, which keeps
 * the app's entire browser-visible network footprint on a single origin. This matters
 * for enterprise deployments: corporate secure web gateways (Zscaler, Netskope, etc.)
 * often flag or block unrecognized third-party domains reached directly from a page,
 * whereas a single first-party API surface is far less likely to trip those policies.
 */
@Service
public class WeatherService {

    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public WeatherService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(4));
        requestFactory.setReadTimeout(Duration.ofSeconds(6));
        this.restClient = RestClient.builder()
            .requestFactory(requestFactory)
            .defaultHeader("User-Agent", "CareFlowAI/0.1 (hospital operations demo; server-side weather proxy)")
            .defaultHeader("Accept", "application/json")
            .build();
    }

    public WeatherResponse current(double latitude, double longitude) {
        double safeLatitude = clamp(latitude, -90, 90);
        double safeLongitude = clamp(longitude, -180, 180);
        String url = ("https://api.open-meteo.com/v1/forecast"
            + "?latitude=%s&longitude=%s&current=temperature_2m,weather_code,is_day&timezone=auto")
            .formatted(safeLatitude, safeLongitude);

        try {
            String body = restClient.get().uri(url).retrieve().body(String.class);
            JsonNode current = objectMapper.readTree(body).path("current");
            return new WeatherResponse(
                (int) Math.round(current.path("temperature_2m").asDouble(0)),
                current.path("weather_code").asInt(0),
                current.path("is_day").asInt(1) == 1
            );
        } catch (Exception failure) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather service unavailable.");
        }
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
