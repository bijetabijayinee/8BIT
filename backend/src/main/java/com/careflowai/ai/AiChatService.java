package com.careflowai.ai;

import com.careflowai.ai.dto.AiChatRequest;
import com.careflowai.ai.dto.AiChatResponse;
import com.careflowai.allocation.HospitalAllocationService;
import com.careflowai.metrics.QueueMetricsResponse;
import com.careflowai.metrics.QueueMetricsService;
import com.careflowai.patient.PatientRepository;
import com.careflowai.queue.QueueService;
import com.careflowai.queue.dto.QueueEntryResponse;
import com.careflowai.staff.StaffUserService;
import com.careflowai.vector.SimpleIntakeVectorStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

/**
 * Savi's chat brain. Runs as an LLM tool-calling agent: the model decides which
 * workspace tools to call (live queue, patient records, knowledge, allocation) and
 * can perform real actions (status changes, doctor assignment, priority overrides)
 * through the same permission-checked services the UI uses.
 */
@Service
public class AiChatService {

    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);

    private static final String AGENT_INSTRUCTION = """
        You are Savi, CareFlow AI's autonomous hospital operations agent. Staff talk to you
        inside the live workspace and you have TOOLS - use them; never guess or invent data.

        How to work:
        - Any question about patients, the queue, waits, doctors, beds, or metrics: call the
          matching read tool first (getLiveQueue, getQueueMetrics, searchPatientRecords,
          getHospitalAllocation, listStaff), then answer from the returned data only.
        - Questions about policies, protocols, or uploaded documents: call searchHospitalKnowledge.
        - INSTRUCTIONS TO ACT ("start treatment for X", "assign Dr Y to Z", "escalate/discharge
          W", "mark the longest waiting critical patient in treatment"): first call getLiveQueue
          (and listStaff for doctor codes) to resolve the exact patientDisplayId, then call the
          action tool (updatePatientStatus, assignDoctorToPatient, overridePatientPriority),
          then confirm exactly what you did with the returned values.
        - If an action tool returns ERROR, relay the reason plainly and suggest what would work.
        - Never fabricate an action or claim success without a tool's OK response.
        - You handle operations (status, routing, priority). New clinical diagnosis or treatment
          decisions belong to licensed clinicians - share only recorded triage facts.

        Formatting rules (the UI renders these):
        - Short lines; "- " bullets; "Label: value" lines for facts.
        - Keep exact numbers (scores, counts, minutes, vitals) explicit; they are auto-highlighted.
        - Start clinically concerning or time-sensitive lines with "WARNING:".
        - No markdown headings, tables, or code fences.
        """;

    private final ChatClient chatClient;
    private final QueueMetricsService queueMetricsService;
    private final QueueService queueService;
    private final HospitalAllocationService hospitalAllocationService;
    private final StaffUserService staffUserService;
    private final PatientRepository patientRepository;
    private final SimpleIntakeVectorStore vectorStore;
    private final ObjectMapper objectMapper;

    public AiChatService(ChatClient.Builder chatClientBuilder,
                         QueueMetricsService queueMetricsService,
                         QueueService queueService,
                         HospitalAllocationService hospitalAllocationService,
                         StaffUserService staffUserService,
                         PatientRepository patientRepository,
                         SimpleIntakeVectorStore vectorStore,
                         ObjectMapper objectMapper) {
        this.chatClient = chatClientBuilder.build();
        this.queueMetricsService = queueMetricsService;
        this.queueService = queueService;
        this.hospitalAllocationService = hospitalAllocationService;
        this.staffUserService = staffUserService;
        this.patientRepository = patientRepository;
        this.vectorStore = vectorStore;
        this.objectMapper = objectMapper;
    }

    public AiChatResponse chat(AiChatRequest request) {
        String message = request.message() == null ? "" : request.message().trim();
        SaviAgentTools tools = new SaviAgentTools(
            queueService,
            queueMetricsService,
            hospitalAllocationService,
            staffUserService,
            patientRepository,
            vectorStore,
            objectMapper,
            request.actorName(),
            request.actorRole()
        );

        try {
            String content = chatClient.prompt()
                .system(AGENT_INSTRUCTION)
                .user(userPayload(request, message))
                .tools(tools)
                .call()
                .content();
            if (content == null || content.isBlank()) {
                log.warn("Savi agent returned an empty response for message: {}", shortContent(message, 120));
                return fallbackResponse(message);
            }
            List<String> actions = tools.actionPerformed()
                ? List.of("refresh_queue", "refresh_dashboard")
                : suggestedActions(message);
            return new AiChatResponse(content.trim(), actions, true, Instant.now());
        } catch (Exception failure) {
            log.warn("Savi agent chat failed ({}: {}). Falling back to deterministic answer.",
                failure.getClass().getSimpleName(), failure.getMessage());
            return fallbackResponse(message);
        }
    }

    private String userPayload(AiChatRequest request, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("staff", Map.of(
            "name", request.actorName() == null ? "Unknown" : request.actorName(),
            "role", request.actorRole() == null ? "Unknown" : request.actorRole()
        ));
        payload.put("message", message);
        if (request.history() != null && !request.history().isEmpty()) {
            payload.put("recentConversation", request.history().stream()
                .filter(turn -> turn != null && turn.text() != null && !turn.text().isBlank())
                .skip(Math.max(0, request.history().size() - 10))
                .map(turn -> Map.of(
                    "role", turn.role() == null ? "staff" : turn.role(),
                    "text", shortContent(turn.text(), 400)
                ))
                .toList());
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception serializationFailure) {
            return message;
        }
    }

    private AiChatResponse fallbackResponse(String message) {
        String normalized = message == null ? "" : message.toLowerCase();
        QueueMetricsResponse metrics = queueMetricsService.currentMetrics();
        String reply;
        if (normalized.contains("critical") || normalized.contains("urgent")) {
            reply = "There are " + metrics.criticalAndHighWaiting()
                + " critical or high-priority patients waiting. Review the queue filter for Critical and High first.";
        } else if (normalized.contains("doctor") || normalized.contains("assign")) {
            reply = doctorSummary(queueService.getQueue(null, null, null).stream().limit(8).toList());
        } else if (normalized.contains("patient") || normalized.contains("treatment")) {
            List<SimpleIntakeVectorStore.SearchResult> matches = vectorStore.search(message, 1);
            reply = matches.isEmpty()
                ? "I could not reach the AI service and found no matching record. Try a patient ID or complaint keyword."
                : "Closest record - Patient: %s. %s".formatted(
                    matches.get(0).document().getPatientDisplayId(),
                    shortContent(matches.get(0).document().getContent(), 220));
        } else if (normalized.contains("wait")) {
            reply = "Longest waits by urgency are on the dashboard. Sort the queue by wait time for row-level review.";
        } else {
            reply = "WARNING: I could not reach the AI service just now, so I cannot take actions or answer from live data. "
                + "Check the backend logs for 'Savi agent chat failed' to see the cause, then try again.";
        }
        return new AiChatResponse(reply, suggestedActions(message), false, Instant.now());
    }

    private String doctorSummary(List<QueueEntryResponse> queueContext) {
        List<String> assigned = queueContext.stream()
            .filter(entry -> entry.assignedDoctor() != null)
            .limit(5)
            .map(entry -> entry.patientDisplayId() + " is assigned to " + entry.assignedDoctor().displayName())
            .toList();
        if (assigned.isEmpty()) {
            return "No active queue patients have a doctor assignment visible right now.";
        }
        return "Current doctor assignments: " + String.join("; ", assigned) + ".";
    }

    private String shortContent(String content, int maxLength) {
        String compact = content == null ? "" : content.replaceAll("\\s+", " ").trim();
        return compact.length() <= maxLength ? compact : compact.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    private List<String> suggestedActions(String message) {
        String normalized = message == null ? "" : message.toLowerCase();
        if (normalized.contains("refresh") || normalized.contains("reload")) {
            return List.of("refresh_queue", "refresh_dashboard");
        }
        if (normalized.contains("critical") || normalized.contains("urgent")) {
            return List.of("filter_critical_high");
        }
        if (normalized.contains("intake")) {
            return List.of("open_intake");
        }
        return List.of();
    }
}
