package com.careflowai.intake.dto;

import com.careflowai.assessment.dto.UrgencyAssessmentResponse;
import com.careflowai.common.AgeBand;
import com.careflowai.common.ArrivalMode;
import com.careflowai.common.QueueStatus;
import com.careflowai.intake.Intake;
import java.util.ArrayList;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record IntakeResponse(
    UUID intakeId,
    UUID patientId,
    String patientDisplayId,
    AgeBand ageBand,
    Instant arrivalTimestamp,
    ArrivalMode arrivalMode,
    String chiefComplaint,
    String symptomNotes,
    List<String> structuredSymptoms,
    int painLevel,
    VitalsDto vitals,
    RiskFlagsDto riskFlags,
    String department,
    QueueStatus currentStatus,
    String staffNotes,
    UrgencyAssessmentResponse assessment,
    Instant createdAt
) {
    public static IntakeResponse from(Intake intake, UrgencyAssessmentResponse assessment) {
        return new IntakeResponse(
            intake.getId(),
            intake.getPatient().getId(),
            intake.getPatient().getDisplayId(),
            intake.getPatient().getAgeBand(),
            intake.getArrivalTimestamp(),
            intake.getArrivalMode(),
            intake.getChiefComplaint(),
            intake.getSymptomNotes(),
            new ArrayList<>(intake.getStructuredSymptoms()),
            intake.getPainLevel(),
            new VitalsDto(
                intake.getVitals().getAge(),
                intake.getVitals().getHeightCm(),
                intake.getVitals().getWeightKg(),
                intake.getVitals().getTemperatureC(),
                intake.getVitals().getHeartRate(),
                intake.getVitals().getSystolicPressure(),
                intake.getVitals().getDiastolicPressure(),
                intake.getVitals().getRespiratoryRate(),
                intake.getVitals().getOxygenSaturation()
            ),
            new RiskFlagsDto(
                intake.getRiskFlags().isChestPain(),
                intake.getRiskFlags().isBreathingDifficulty(),
                intake.getRiskFlags().isAlteredMentalState(),
                intake.getRiskFlags().isSevereBleeding(),
                intake.getRiskFlags().isPregnancy(),
                intake.getRiskFlags().isPediatricRisk(),
                intake.getRiskFlags().isFallOrTrauma(),
                intake.getRiskFlags().isImmunocompromised()
            ),
            intake.getDepartment(),
            intake.getCurrentStatus(),
            intake.getStaffNotes(),
            assessment,
            intake.getCreatedAt()
        );
    }
}
