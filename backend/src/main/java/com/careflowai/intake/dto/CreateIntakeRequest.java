package com.careflowai.intake.dto;

import com.careflowai.common.AgeBand;
import com.careflowai.common.ArrivalMode;
import com.careflowai.common.QueueStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record CreateIntakeRequest(
    String patientDisplayId,
    @NotBlank String patientName,
    String gender,
    @NotBlank String contactPhone,
    @NotNull AgeBand ageBand,
    Instant arrivalTimestamp,
    @NotNull ArrivalMode arrivalMode,
    @jakarta.validation.constraints.NotBlank String chiefComplaint,
    String symptomNotes,
    List<String> structuredSymptoms,
    @Min(0) @Max(10) int painLevel,
    VitalsDto vitals,
    RiskFlagsDto riskFlags,
    @jakarta.validation.constraints.NotBlank String department,
    QueueStatus currentStatus,
    String staffNotes,
    String staffName
) {
}
