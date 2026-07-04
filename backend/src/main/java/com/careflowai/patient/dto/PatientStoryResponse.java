package com.careflowai.patient.dto;

import com.careflowai.agent.dto.PatientTimelineEventResponse;
import com.careflowai.common.AgeBand;
import com.careflowai.common.ConfidenceLevel;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.UrgencyCategory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The full "story" of one patient for the directory detail view: what the triage LLM
 * decided and from which metrics, how the agents sorted/assigned/notified, and what
 * the research agent found online (briefing plus citations).
 */
public record PatientStoryResponse(
    UUID patientId,
    String patientDisplayId,
    AgeBand ageBand,
    String department,
    String chiefComplaint,
    List<String> structuredSymptoms,
    QueueStatus currentStatus,
    Instant arrivedAt,
    Assessment assessment,
    Assignment assignment,
    Research research,
    List<PatientTimelineEventResponse> timeline,
    List<PatientDirectoryEntryResponse.PatientFileResponse> files
) {

    public record Assessment(
        UrgencyCategory finalCategory,
        Integer finalScore,
        String suggestedDiagnosis,
        String medicalAttentionNote,
        String structuredSymptomSummary,
        String staffFacingExplanation,
        ConfidenceLevel confidenceLevel,
        List<String> scoreFactors,
        List<String> redFlagIndicators,
        List<String> missingOrAmbiguousDetails
    ) {
    }

    public record Assignment(
        String doctorName,
        String doctorSpecialty,
        String reason,
        Instant assignedAt
    ) {
    }

    public record Research(
        String briefing,
        List<Citation> citations
    ) {
        public record Citation(String title, String url) {
        }
    }
}
