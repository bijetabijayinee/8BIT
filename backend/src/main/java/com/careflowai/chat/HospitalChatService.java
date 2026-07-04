package com.careflowai.chat;

import com.careflowai.ai.AiChatService;
import com.careflowai.ai.dto.AiChatRequest;
import com.careflowai.chat.dto.HospitalChatMessageResponse;
import com.careflowai.chat.dto.HospitalChatRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class HospitalChatService {

    private static final int MAX_MESSAGES = 80;

    private final AiChatService aiChatService;
    private final List<HospitalChatMessageResponse> messages = new ArrayList<>();

    public HospitalChatService(AiChatService aiChatService) {
        this.aiChatService = aiChatService;
    }

    public synchronized List<HospitalChatMessageResponse> list() {
        return List.copyOf(messages);
    }

    public synchronized List<HospitalChatMessageResponse> post(HospitalChatRequest request) {
        append(new HospitalChatMessageResponse(
            UUID.randomUUID().toString(),
            request.authorName(),
            request.authorRole(),
            request.body().trim(),
            false,
            Instant.now()
        ));

        if (request.body().toLowerCase().contains("@savi")) {
            String saviPrompt = request.body().replaceAll("(?i)@savi", "").trim();
            String reply = aiChatService.chat(new AiChatRequest(
                saviPrompt.isBlank() ? request.body() : saviPrompt,
                request.authorName(),
                request.authorRole(),
                null
            )).message();
            append(new HospitalChatMessageResponse(
                UUID.randomUUID().toString(),
                "Savi",
                null,
                reply,
                true,
                Instant.now()
            ));
        }

        return List.copyOf(messages);
    }

    private void append(HospitalChatMessageResponse message) {
        messages.add(message);
        while (messages.size() > MAX_MESSAGES) {
            messages.remove(0);
        }
    }
}
