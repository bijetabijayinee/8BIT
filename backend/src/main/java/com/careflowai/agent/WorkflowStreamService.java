package com.careflowai.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Broadcasts real agent-workflow progress (intake persisted, LLM call, queue sort,
 * doctor assignment, notification, research) to subscribed UI clients over SSE.
 */
@Service
public class WorkflowStreamService {

    private static final long EMITTER_TIMEOUT_MS = 30L * 60_000;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper;

    public WorkflowStreamService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("connected").data("{\"connected\":true}"));
        } catch (Exception ignored) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    public void publish(String patientDisplayId, String stage, String agent, String title, String detail) {
        publish(patientDisplayId, stage, agent, title, detail, null);
    }

    public void publish(String patientDisplayId, String stage, String agent, String title, String detail, String reasoning) {
        WorkflowEvent event = new WorkflowEvent(patientDisplayId, stage, agent, title, detail, reasoning, Instant.now());
        String json;
        try {
            json = objectMapper.writeValueAsString(event);
        } catch (Exception serializationFailure) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("workflow").data(json));
            } catch (Exception sendFailure) {
                emitters.remove(emitter);
            }
        }
    }

    public record WorkflowEvent(
        String patientDisplayId,
        String stage,
        String agent,
        String title,
        String detail,
        String reasoning,
        Instant timestamp
    ) {
    }
}
