package com.careflowai.common;

public enum StaffRole {
    INTAKE_STAFF,
    DOCTOR,
    TRIAGE_NURSE,
    CHARGE_NURSE,
    ADMIN;

    public boolean canOverridePriority() {
        return this == TRIAGE_NURSE || this == CHARGE_NURSE || this == ADMIN;
    }

    public boolean canUpdateQueueStatus() {
        // Intake staff can move patients through the queue (including starting treatment)
        // so a single desk can run the floor end to end in a small ED.
        return this == DOCTOR || this == INTAKE_STAFF || canOverridePriority();
    }
}
