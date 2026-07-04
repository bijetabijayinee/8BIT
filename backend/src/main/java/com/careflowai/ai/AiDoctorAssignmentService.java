package com.careflowai.ai;

import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.intake.Intake;
import com.careflowai.staff.StaffUser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class AiDoctorAssignmentService {

    private static final String INSTRUCTION = """
        You are CareFlow AI's doctor assignment agent for a hospital queue MVP.
        You do not diagnose or recommend treatment. Choose the best doctor from the provided roster only.
        Return only compact JSON with: staffCode, assignmentReason.
        staffCode must exactly match one availableDoctors[].staffCode.
        Base the assignment on urgency, department, specialty fit, symptoms, risk flags, vitals, and workload context
        supplied in the payload. If medicalResearchBriefing is present, use it to judge which specialty
        the condition needs. Keep assignmentReason under 300 characters.
        """;

    private final OpenAiResponsesClient responsesClient;
    private final ObjectMapper objectMapper;

    public AiDoctorAssignmentService(OpenAiResponsesClient responsesClient, ObjectMapper objectMapper) {
        this.responsesClient = responsesClient;
        this.objectMapper = objectMapper;
    }

    public Optional<AiDoctorAssignmentOutput> recommend(Intake intake, UrgencyAssessment assessment,
                                                        List<StaffUser> availableDoctors) {
        return recommend(intake, assessment, availableDoctors, null);
    }

    public Optional<AiDoctorAssignmentOutput> recommend(Intake intake, UrgencyAssessment assessment,
                                                        List<StaffUser> availableDoctors, String researchBriefing) {
        if (!responsesClient.isAvailable() || availableDoctors.isEmpty()) {
            return Optional.empty();
        }

        try {
            String response = responsesClient.respond(
                INSTRUCTION,
                objectMapper.writeValueAsString(payload(intake, assessment, availableDoctors, researchBriefing))
            );
            JsonNode json = objectMapper.readTree(extractJson(response));
            String staffCode = text(json, "staffCode");
            if (!hasText(staffCode) || availableDoctors.stream().noneMatch(doctor ->
                doctor.getStaffCode().equalsIgnoreCase(staffCode.trim()))) {
                return Optional.empty();
            }
            return Optional.of(new AiDoctorAssignmentOutput(staffCode.trim(), text(json, "assignmentReason")));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    private Map<String, Object> payload(Intake intake, UrgencyAssessment assessment, List<StaffUser> availableDoctors,
                                        String researchBriefing) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("intake", intakePayload(intake));
        payload.put("urgencyAssessment", assessmentPayload(assessment));
        if (researchBriefing != null && !researchBriefing.isBlank()) {
            payload.put("medicalResearchBriefing", researchBriefing);
        }
        payload.put("availableDoctors", availableDoctors.stream()
            .map(this::doctorPayload)
            .toList());
        return payload;
    }

    private Map<String, Object> intakePayload(Intake intake) {
        Map<String, Object> intakePayload = new LinkedHashMap<>();
        intakePayload.put("patientDisplayId", intake.getPatient().getDisplayId());
        intakePayload.put("ageBand", intake.getPatient().getAgeBand());
        intakePayload.put("arrivalMode", intake.getArrivalMode());
        intakePayload.put("chiefComplaint", intake.getChiefComplaint());
        intakePayload.put("symptomNotes", intake.getSymptomNotes());
        intakePayload.put("structuredSymptoms", intake.getStructuredSymptoms());
        intakePayload.put("clinicalDistressScore", intake.getPainLevel());
        intakePayload.put("vitals", intake.getVitals());
        intakePayload.put("riskFlags", intake.getRiskFlags());
        intakePayload.put("department", intake.getDepartment());
        intakePayload.put("status", intake.getCurrentStatus());
        return intakePayload;
    }

    private Map<String, Object> assessmentPayload(UrgencyAssessment assessment) {
        Map<String, Object> assessmentPayload = new LinkedHashMap<>();
        if (assessment == null) {
            return assessmentPayload;
        }
        assessmentPayload.put("finalCategory", assessment.getFinalCategory());
        assessmentPayload.put("finalScore", assessment.getFinalScore());
        assessmentPayload.put("scoreFactors", assessment.getScoreFactors());
        assessmentPayload.put("redFlags", assessment.getRedFlagIndicators());
        assessmentPayload.put("missingOrAmbiguousDetails", assessment.getMissingOrAmbiguousDetails());
        assessmentPayload.put("structuredSymptomSummary", assessment.getStructuredSymptomSummary());
        assessmentPayload.put("staffFacingExplanation", assessment.getStaffFacingExplanation());
        assessmentPayload.put("confidenceLevel", assessment.getConfidenceLevel());
        return assessmentPayload;
    }

    private Map<String, Object> doctorPayload(StaffUser doctor) {
        Map<String, Object> doctorPayload = new LinkedHashMap<>();
        doctorPayload.put("staffCode", doctor.getStaffCode());
        doctorPayload.put("displayName", doctor.getDisplayName());
        doctorPayload.put("department", doctor.getDepartment());
        doctorPayload.put("specialty", doctor.getSpecialty());
        return doctorPayload;
    }

    private String extractJson(String response) {
        int first = response.indexOf('{');
        int last = response.lastIndexOf('}');
        if (first >= 0 && last > first) {
            return response.substring(first, last + 1);
        }
        return response;
    }

    private String text(JsonNode json, String fieldName) {
        JsonNode node = json.path(fieldName);
        return node.isTextual() ? node.asText() : null;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
