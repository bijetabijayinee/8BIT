package com.careflowai.ai;

import com.careflowai.allocation.HospitalAllocationService;
import com.careflowai.common.OverrideReason;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.StaffRole;
import com.careflowai.common.UrgencyCategory;
import com.careflowai.metrics.QueueMetricsService;
import com.careflowai.patient.Patient;
import com.careflowai.patient.PatientRepository;
import com.careflowai.queue.QueueService;
import com.careflowai.queue.dto.AssignDoctorRequest;
import com.careflowai.queue.dto.OverridePriorityRequest;
import com.careflowai.queue.dto.QueueEntryResponse;
import com.careflowai.queue.dto.UpdateStatusRequest;
import com.careflowai.staff.StaffUserService;
import com.careflowai.vector.SimpleIntakeVectorStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.web.server.ResponseStatusException;

/**
 * The tools Savi (the workspace agent) can call during a chat turn. One instance is
 * created per request so actions are attributed to the requesting staff member and
 * permission checks run exactly as they do for the queue UI.
 */
public class SaviAgentTools {

    private final QueueService queueService;
    private final QueueMetricsService queueMetricsService;
    private final HospitalAllocationService hospitalAllocationService;
    private final StaffUserService staffUserService;
    private final PatientRepository patientRepository;
    private final SimpleIntakeVectorStore vectorStore;
    private final ObjectMapper objectMapper;
    private final String actorName;
    private final StaffRole actorRole;

    private boolean actionPerformed;

    public SaviAgentTools(QueueService queueService,
                          QueueMetricsService queueMetricsService,
                          HospitalAllocationService hospitalAllocationService,
                          StaffUserService staffUserService,
                          PatientRepository patientRepository,
                          SimpleIntakeVectorStore vectorStore,
                          ObjectMapper objectMapper,
                          String actorName,
                          StaffRole actorRole) {
        this.queueService = queueService;
        this.queueMetricsService = queueMetricsService;
        this.hospitalAllocationService = hospitalAllocationService;
        this.staffUserService = staffUserService;
        this.patientRepository = patientRepository;
        this.vectorStore = vectorStore;
        this.objectMapper = objectMapper;
        this.actorName = actorName;
        this.actorRole = actorRole == null ? StaffRole.TRIAGE_NURSE : actorRole;
    }

    public boolean actionPerformed() {
        return actionPerformed;
    }

    @Tool(description = "Get the live patient queue: every patient's display id, urgency category and score, "
        + "status, waiting minutes, department, chief complaint, and assigned doctor. "
        + "Call this first to resolve references like 'the longest waiting critical patient'.")
    public String getLiveQueue() {
        List<Map<String, Object>> queue = queueService.getQueue(null, null, null).stream()
            .map(this::queueEntryPayload)
            .toList();
        return toJson(Map.of("queue", queue, "totalPatients", queue.size()));
    }

    @Tool(description = "Get queue metrics: queue size, critical/high count, average and longest waits per urgency, override count.")
    public String getQueueMetrics() {
        return toJson(queueMetricsService.currentMetrics());
    }

    @Tool(description = "Get hospital allocation: bed occupancy and doctor engagement by department.")
    public String getHospitalAllocation() {
        return toJson(hospitalAllocationService.currentAllocation());
    }

    @Tool(description = "List staff members. Pass role DOCTOR to get the doctor roster with staff codes and specialties; "
        + "other roles: INTAKE_STAFF, TRIAGE_NURSE, CHARGE_NURSE, ADMIN. Pass null or empty for everyone.")
    public String listStaff(@ToolParam(description = "Optional role filter", required = false) String role) {
        StaffRole parsedRole = parseEnum(role, StaffRole.class);
        return toJson(staffUserService.list(parsedRole, null).stream().limit(25).toList());
    }

    @Tool(description = "Semantic search over patient intake records: symptoms, complaints, triage summaries, "
        + "diagnoses, research briefings. Use for questions about a specific patient or presentation.")
    public String searchPatientRecords(@ToolParam(description = "Free-text query, e.g. 'chest pain patient' or a patient id") String query) {
        List<Map<String, Object>> matches = vectorStore.search(query, 4).stream()
            .map(result -> Map.<String, Object>of(
                "patientDisplayId", result.document().getPatientDisplayId(),
                "record", shorten(result.document().getContent(), 900)
            ))
            .toList();
        return matches.isEmpty()
            ? "No matching patient records found."
            : toJson(Map.of("matches", matches));
    }

    @Tool(description = "Search uploaded hospital knowledge documents (policies, protocols, guidelines, manuals).")
    public String searchHospitalKnowledge(@ToolParam(description = "Free-text query about hospital policies or knowledge") String query) {
        List<Map<String, Object>> matches = vectorStore.searchKnowledge(query, 3).stream()
            .map(result -> Map.<String, Object>of(
                "title", result.document().getTitle(),
                "fileName", result.document().getFileName(),
                "excerpt", shorten(result.document().getContent(), 1200)
            ))
            .toList();
        return matches.isEmpty()
            ? "No hospital knowledge documents matched this query."
            : toJson(Map.of("documents", matches));
    }

    @Tool(description = "ACTION - update a patient's queue status. Valid statuses: WAITING, IN_TRIAGE, IN_TREATMENT "
        + "(start treatment), DISCHARGED (treatment done). Returns confirmation or an error to relay to staff.")
    public String updatePatientStatus(
        @ToolParam(description = "Exact patient display id from the queue, e.g. CF-20260704-0001") String patientDisplayId,
        @ToolParam(description = "New status: WAITING, IN_TRIAGE, IN_TREATMENT, or DISCHARGED") String status) {
        Patient patient = findPatient(patientDisplayId);
        if (patient == null) {
            return "ERROR: no patient found with display id " + patientDisplayId + ". Call getLiveQueue to see valid ids.";
        }
        QueueStatus parsedStatus = parseEnum(status, QueueStatus.class);
        if (parsedStatus == null) {
            return "ERROR: invalid status '" + status + "'. Use WAITING, IN_TRIAGE, IN_TREATMENT, or DISCHARGED.";
        }
        try {
            QueueEntryResponse updated = queueService.updateStatus(patient.getId(),
                new UpdateStatusRequest(parsedStatus, actorName, actorRole));
            actionPerformed = true;
            return "OK: %s is now %s (urgency %s/%d, department %s).".formatted(
                updated.patientDisplayId(), updated.status(), updated.urgencyCategory(),
                updated.urgencyScore(), updated.department());
        } catch (ResponseStatusException rejection) {
            return "ERROR: " + (rejection.getReason() == null ? "the action was rejected." : rejection.getReason());
        }
    }

    @Tool(description = "ACTION - assign a doctor to a patient. doctorStaffCode must come from listStaff(role=DOCTOR).")
    public String assignDoctorToPatient(
        @ToolParam(description = "Exact patient display id") String patientDisplayId,
        @ToolParam(description = "Doctor staff code, e.g. DOCTOR-01") String doctorStaffCode,
        @ToolParam(description = "Short reason for the assignment", required = false) String reason) {
        Patient patient = findPatient(patientDisplayId);
        if (patient == null) {
            return "ERROR: no patient found with display id " + patientDisplayId + ".";
        }
        try {
            QueueEntryResponse updated = queueService.assignDoctor(patient.getId(), new AssignDoctorRequest(
                doctorStaffCode,
                actorName,
                actorRole,
                reason == null || reason.isBlank() ? "Assigned by Savi on staff instruction." : reason
            ));
            actionPerformed = true;
            String doctorName = updated.assignedDoctor() == null ? doctorStaffCode : updated.assignedDoctor().displayName();
            return "OK: assigned %s to %s.".formatted(doctorName, updated.patientDisplayId());
        } catch (ResponseStatusException rejection) {
            return "ERROR: " + (rejection.getReason() == null ? "the assignment was rejected." : rejection.getReason());
        }
    }

    @Tool(description = "ACTION - override a patient's urgency priority (escalate or de-escalate). "
        + "Requires a category (CRITICAL, HIGH, MEDIUM, LOW) and a 0-100 severity score consistent with it.")
    public String overridePatientPriority(
        @ToolParam(description = "Exact patient display id") String patientDisplayId,
        @ToolParam(description = "New urgency category: CRITICAL, HIGH, MEDIUM, or LOW") String newCategory,
        @ToolParam(description = "New severity score 0-100") Integer newScore,
        @ToolParam(description = "Short clinical/operational reason", required = false) String reason) {
        Patient patient = findPatient(patientDisplayId);
        if (patient == null) {
            return "ERROR: no patient found with display id " + patientDisplayId + ".";
        }
        UrgencyCategory category = parseEnum(newCategory, UrgencyCategory.class);
        if (category == null) {
            return "ERROR: invalid urgency category '" + newCategory + "'.";
        }
        int score = Math.max(0, Math.min(100, newScore == null ? defaultScore(category) : newScore));
        try {
            QueueEntryResponse updated = queueService.overridePriority(patient.getId(), new OverridePriorityRequest(
                category,
                score,
                OverrideReason.STAFF_CLINICAL_JUDGMENT,
                reason == null || reason.isBlank() ? "Priority changed by Savi on staff instruction." : reason,
                actorName,
                actorRole
            ));
            actionPerformed = true;
            return "OK: %s is now %s with score %d.".formatted(updated.patientDisplayId(), updated.urgencyCategory(), updated.urgencyScore());
        } catch (ResponseStatusException rejection) {
            return "ERROR: " + (rejection.getReason() == null ? "the override was rejected." : rejection.getReason());
        }
    }

    private Map<String, Object> queueEntryPayload(QueueEntryResponse entry) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("patientDisplayId", entry.patientDisplayId());
        payload.put("urgency", entry.urgencyCategory());
        payload.put("urgencyScore", entry.urgencyScore());
        payload.put("status", entry.status());
        payload.put("waitingMinutes", entry.waitingMinutes());
        payload.put("department", entry.department());
        payload.put("chiefComplaint", entry.chiefComplaint());
        payload.put("assignedDoctor", entry.assignedDoctor() == null ? null : entry.assignedDoctor().displayName());
        return payload;
    }

    private Patient findPatient(String displayId) {
        if (displayId == null || displayId.isBlank()) {
            return null;
        }
        return patientRepository.findByDisplayId(displayId.trim().toUpperCase(Locale.ROOT)).orElse(null);
    }

    private int defaultScore(UrgencyCategory category) {
        return switch (category) {
            case CRITICAL -> 90;
            case HIGH -> 72;
            case MEDIUM -> 50;
            case LOW -> 25;
        };
    }

    private <T extends Enum<T>> T parseEnum(String value, Class<T> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception serializationFailure) {
            return String.valueOf(value);
        }
    }

    private String shorten(String value, int maxLength) {
        String compact = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        return compact.length() <= maxLength ? compact : compact.substring(0, maxLength - 3) + "...";
    }
}
