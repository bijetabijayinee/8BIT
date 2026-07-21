package com.careflowai.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class OpenAiResponsesClient {

    private final OpenAiProperties properties;
    private final RestClient restClient;
    // Web search calls let the model run multiple real searches before answering, so they
    // need a much longer read timeout than a plain text completion.
    private final RestClient webSearchRestClient;

    public OpenAiResponsesClient(OpenAiProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder
            .baseUrl("https://api.openai.com/v1")
            .requestFactory(requestFactory(Duration.ofSeconds(3), Duration.ofSeconds(8)))
            .build();
        this.webSearchRestClient = restClientBuilder
            .baseUrl("https://api.openai.com/v1")
            .requestFactory(requestFactory(Duration.ofSeconds(5), Duration.ofSeconds(45)))
            .build();
    }

    private static SimpleClientHttpRequestFactory requestFactory(Duration connectTimeout, Duration readTimeout) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeout);
        requestFactory.setReadTimeout(readTimeout);
        return requestFactory;
    }

    public boolean isAvailable() {
        return properties.canCallApi();
    }

    public record WebCitation(String title, String url) {
    }

    public record WebSearchOutcome(String text, List<WebCitation> citations) {
    }

    public String respond(String developerInstruction, String userInput) {
        Map<String, Object> request = Map.of(
            "model", properties.model(),
            "input", List.of(
                Map.of("role", "developer", "content", developerInstruction),
                Map.of("role", "user", "content", userInput)
            )
        );
        JsonNode response = call(restClient, request);
        return extractText(response);
    }

    /**
     * A single reasoning call where the model itself decides what to search - live medical
     * literature, current news, whatever it judges relevant - using OpenAI's hosted web_search
     * tool. Every call is genuinely dynamic: different patients, different queries, different
     * real citations, never a fixed link set. Returns the reasoned text plus the actual URLs
     * the model cited from its own searches.
     */
    public WebSearchOutcome respondWithWebSearch(String developerInstruction, String userInput) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", properties.researchModelOrDefault());
        request.put("input", List.of(
            Map.of("role", "developer", "content", developerInstruction),
            Map.of("role", "user", "content", userInput)
        ));
        request.put("tools", List.of(Map.of("type", "web_search_preview")));
        // Nudge the model to actually use the tool rather than answer from memory.
        request.put("tool_choice", "auto");

        JsonNode response = call(webSearchRestClient, request);
        String text = extractText(response);
        List<WebCitation> citations = extractCitations(response);
        return new WebSearchOutcome(text, citations);
    }

    private JsonNode call(RestClient client, Map<String, Object> request) {
        return client.post()
            .uri("/responses")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(JsonNode.class);
    }

    private String extractText(JsonNode response) {
        if (response == null) {
            return "";
        }
        JsonNode outputText = response.path("output_text");
        if (outputText.isTextual()) {
            return outputText.asText();
        }
        StringBuilder text = new StringBuilder();
        response.path("output").forEach(output -> output.path("content").forEach(content -> {
            JsonNode nodeText = content.path("text");
            if (nodeText.isTextual()) {
                text.append(nodeText.asText()).append('\n');
            }
        }));
        return text.toString().trim();
    }

    /** Pulls the real url_citation annotations the model attached to its own search-grounded text. */
    private List<WebCitation> extractCitations(JsonNode response) {
        List<WebCitation> citations = new ArrayList<>();
        if (response == null) {
            return citations;
        }
        java.util.Set<String> seenUrls = new java.util.LinkedHashSet<>();
        response.path("output").forEach(output -> output.path("content").forEach(content ->
            content.path("annotations").forEach(annotation -> {
                if (!"url_citation".equals(annotation.path("type").asText(""))) {
                    return;
                }
                String url = annotation.path("url").asText("");
                if (url.isBlank() || !seenUrls.add(url)) {
                    return;
                }
                String title = annotation.path("title").asText(url);
                citations.add(new WebCitation(title, url));
            })
        ));
        return citations;
    }
}
