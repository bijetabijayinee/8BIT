package com.careflowai.ai.dto;

import com.careflowai.common.StaffRole;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record AiChatRequest(
    @NotBlank String message,
    String actorName,
    StaffRole actorRole,
    List<ChatTurn> history
) {

    public record ChatTurn(String role, String text) {
    }
}
