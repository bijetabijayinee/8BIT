package com.careflowai.analytics;

import java.util.List;

/**
 * Month-to-date operational results: throughput, the triage/research/assignment mix,
 * per-doctor load balance, and a transparent AI-vs-manual time-saved estimate.
 */
public record ResultsAnalyticsResponse(
    int patientsProcessed,
    int patientsDischarged,
    int agentActions,
    int researchBriefings,
    int researchCoveragePercent,
    List<TrendPoint> dailyThroughput,
    List<TrendPoint> urgencyMix,
    List<TrendPoint> departmentMix,
    List<DoctorLoad> doctorLoad,
    TimeSaved timeSaved
) {
    public record TrendPoint(String label, int count) {
    }

    public record DoctorLoad(String name, String specialty, int patients) {
    }

    /**
     * Per-patient baseline model: manual triage is assumed to take
     * manualTriageMin + manualResearchMin + manualAssignMin per patient, versus a few
     * AI seconds. Every field is surfaced so the assumption stays transparent.
     */
    public record TimeSaved(
        int manualTriageMin,
        int manualResearchMin,
        int manualAssignMin,
        int manualMinutesPerPatient,
        int aiSecondsPerPatient,
        int patients,
        long manualMinutesTotal,
        long aiMinutesTotal,
        long minutesSaved,
        double hoursSaved
    ) {
    }
}
