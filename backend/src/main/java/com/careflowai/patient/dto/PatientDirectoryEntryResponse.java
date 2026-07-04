package com.careflowai.patient.dto;

import com.careflowai.common.AgeBand;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.UrgencyCategory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PatientDirectoryEntryResponse(
    UUID patientId,
    String patientDisplayId,
    AgeBand ageBand,
    String department,
    String chiefComplaint,
    QueueStatus currentStatus,
    UrgencyCategory urgencyCategory,
    Integer urgencyScore,
    String suggestedDiagnosis,
    String medicalAttentionNote,
    String assignedDoctor,
    Instant arrivedAt,
    List<PatientFileResponse> files
) {

    public record PatientFileResponse(
        String fileName,
        String fileType,
        String url,
        String uploadedBy,
        Instant uploadedAt
    ) {
    }
}
