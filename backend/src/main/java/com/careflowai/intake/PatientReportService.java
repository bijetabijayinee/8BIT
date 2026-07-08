package com.careflowai.intake;

import com.careflowai.ai.SpringAiChatService;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.assessment.UrgencyAssessmentRepository;
import com.careflowai.intake.dto.PatientReportResponse;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PatientReportService {

    private static final String REPORT_INSTRUCTION = """
        You are Savi, a hospital clinical operations assistant.
        Create a concise, staff-facing patient report from the supplied intake record only.
        Do not invent diagnoses, prescriptions, tests, allergies, or discharge instructions.
        Use this exact markdown structure:
        # Patient Report
        ## Snapshot
        ## Triage Assessment
        ## Medical Attention Needed
        ## Vitals And Risks
        ## Care Team Next Steps
        Keep it practical, polished, and under 350 words.
        """;

    private final IntakeRepository intakeRepository;
    private final UrgencyAssessmentRepository assessmentRepository;
    private final SpringAiChatService springAiChatService;

    public PatientReportService(IntakeRepository intakeRepository,
                                UrgencyAssessmentRepository assessmentRepository,
                                SpringAiChatService springAiChatService) {
        this.intakeRepository = intakeRepository;
        this.assessmentRepository = assessmentRepository;
        this.springAiChatService = springAiChatService;
    }

    @Transactional(readOnly = true)
    public PatientReportResponse generate(UUID intakeId) {
        Intake intake = intakeRepository.findById(intakeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Intake not found."));
        UrgencyAssessment assessment = assessmentRepository
            .findTopByPatientIdOrderByAssessedAtDesc(intake.getPatient().getId())
            .orElse(null);
        String context = reportContext(intake, assessment);
        try {
            String report = springAiChatService.respond(REPORT_INSTRUCTION, context);
            if (report != null && !report.isBlank()) {
                return new PatientReportResponse(intake.getPatient().getDisplayId(), report.trim(), true, Instant.now());
            }
        } catch (Exception ignored) {
            // Fall back to a deterministic report below.
        }
        return new PatientReportResponse(intake.getPatient().getDisplayId(), fallbackReport(intake, assessment), false, Instant.now());
    }

    private String reportContext(Intake intake, UrgencyAssessment assessment) {
        return """
            Patient: %s
            Age band: %s
            Department: %s
            Status: %s
            Arrival: %s by %s
            Chief complaint: %s
            Symptoms: %s
            Notes: %s
            Pain/distress: %d
            Vitals: Age %s, height %s cm, weight %s kg, Temp %s C, HR %s, BP %s/%s, RR %s, SpO2 %s
            Risks: chest pain %s, breathing difficulty %s, altered mental state %s, severe bleeding %s, pregnancy %s, pediatric risk %s, fall/trauma %s, immunocompromised %s
            Assessment: %s
            Suggested diagnosis: %s
            Medical attention note: %s
            Explanation: %s
            """.formatted(
            intake.getPatient().getDisplayId(),
            intake.getPatient().getAgeBand(),
            intake.getDepartment(),
            intake.getCurrentStatus(),
            intake.getArrivalTimestamp(),
            intake.getArrivalMode(),
            intake.getChiefComplaint(),
            intake.getStructuredSymptoms().isEmpty() ? "Not recorded" : String.join(", ", intake.getStructuredSymptoms()),
            valueOrNone(intake.getSymptomNotes()),
            intake.getPainLevel(),
            valueOrNone(intake.getVitals().getAge()),
            valueOrNone(intake.getVitals().getHeightCm()),
            valueOrNone(intake.getVitals().getWeightKg()),
            valueOrNone(intake.getVitals().getTemperatureC()),
            valueOrNone(intake.getVitals().getHeartRate()),
            valueOrNone(intake.getVitals().getSystolicPressure()),
            valueOrNone(intake.getVitals().getDiastolicPressure()),
            valueOrNone(intake.getVitals().getRespiratoryRate()),
            valueOrNone(intake.getVitals().getOxygenSaturation()),
            intake.getRiskFlags().isChestPain(),
            intake.getRiskFlags().isBreathingDifficulty(),
            intake.getRiskFlags().isAlteredMentalState(),
            intake.getRiskFlags().isSevereBleeding(),
            intake.getRiskFlags().isPregnancy(),
            intake.getRiskFlags().isPediatricRisk(),
            intake.getRiskFlags().isFallOrTrauma(),
            intake.getRiskFlags().isImmunocompromised(),
            assessment == null ? "Not assessed" : assessment.getFinalCategory() + " / " + assessment.getFinalScore(),
            assessment == null ? "Not recorded" : valueOrNone(assessment.getSuggestedDiagnosis()),
            assessment == null ? "Not recorded" : valueOrNone(assessment.getMedicalAttentionNote()),
            assessment == null ? "Not recorded" : valueOrNone(assessment.getStaffFacingExplanation())
        );
    }

    private String fallbackReport(Intake intake, UrgencyAssessment assessment) {
        return """
            # Patient Report
            ## Snapshot
            %s is in %s with status %s for %s.

            ## Triage Assessment
            %s

            ## Medical Attention Needed
            %s

            ## Vitals And Risks
            Age %s, height %s cm, weight %s kg. Temp %s C, HR %s, BP %s/%s, RR %s, SpO2 %s. Distress score %d.

            ## Care Team Next Steps
            Review the intake record, validate the triage findings, and document clinician-directed next steps.
            """.formatted(
            intake.getPatient().getDisplayId(),
            intake.getDepartment(),
            intake.getCurrentStatus(),
            intake.getChiefComplaint(),
            assessment == null ? "No assessment is recorded." : assessment.getFinalCategory() + " urgency with score " + assessment.getFinalScore() + ".",
            assessment == null ? "No medical attention note is recorded." : valueOrNone(assessment.getMedicalAttentionNote()),
            valueOrNone(intake.getVitals().getAge()),
            valueOrNone(intake.getVitals().getHeightCm()),
            valueOrNone(intake.getVitals().getWeightKg()),
            valueOrNone(intake.getVitals().getTemperatureC()),
            valueOrNone(intake.getVitals().getHeartRate()),
            valueOrNone(intake.getVitals().getSystolicPressure()),
            valueOrNone(intake.getVitals().getDiastolicPressure()),
            valueOrNone(intake.getVitals().getRespiratoryRate()),
            valueOrNone(intake.getVitals().getOxygenSaturation()),
            intake.getPainLevel()
        ).trim();
    }

    private String valueOrNone(Object value) {
        return value == null || value.toString().isBlank() ? "Not recorded" : value.toString();
    }
}
