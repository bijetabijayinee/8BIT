package com.careflowai.ai;

import com.careflowai.ai.dto.AiChatRequest;
import com.careflowai.ai.dto.AiChatResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiChatService aiChatService;
    private final SpringAiChatService springAiChatService;
    private final ObjectMapper objectMapper;

    public AiController(AiChatService aiChatService, SpringAiChatService springAiChatService,
                        ObjectMapper objectMapper) {
        this.aiChatService = aiChatService;
        this.springAiChatService = springAiChatService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/draft-symptom-notes")
    public Map<String, String> draftSymptomNotes(@RequestBody JsonNode intakeFields) {
        try {
            String notes = springAiChatService.draftSymptomNotes(objectMapper.writeValueAsString(intakeFields));
            if (notes.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI service returned no note text.");
            }
            return Map.of("notes", notes);
        } catch (ResponseStatusException statusException) {
            throw statusException;
        } catch (Exception failure) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                "Could not draft symptom notes right now. Check the AI service configuration.");
        }
    }

    @PostMapping("/chat")
    public AiChatResponse chat(@Valid @RequestBody AiChatRequest request) {
        return aiChatService.chat(request);
    }

    @PostMapping("/test-chat")
    public AiChatResponse testChat(@Valid @RequestBody AiChatRequest request) {
        return springAiChatService.chat(request);
    }
}
