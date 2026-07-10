package com.careflowai.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "openai")
public record OpenAiProperties(
    boolean enabled,
    String apiKey,
    String model,
    String researchModel
) {
    public boolean canCallApi() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }

    /** Model used for live web-search research calls; falls back to the main model if unset. */
    public String researchModelOrDefault() {
        return researchModel != null && !researchModel.isBlank() ? researchModel : model;
    }
}
