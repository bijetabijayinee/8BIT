package com.careflowai.allocation.dto;

import com.careflowai.common.QueueStatus;
import com.careflowai.common.UrgencyCategory;

public record BedAllocationResponse(
    String id,
    String department,
    String label,
    boolean filled,
    String patientId,
    String patientDisplayId,
    String intakeId,
    String chiefComplaint,
    UrgencyCategory urgencyCategory,
    QueueStatus status,
    long waitingMinutes
) {
}
