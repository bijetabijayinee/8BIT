package com.careflowai.agent.dto;

import java.time.Instant;
import java.util.List;

public record AgentPerformanceResponse(
    int patientsProcessed,
    int agentActionsTotal,
    List<AgentPerformance> agents,
    PipelineObservability pipeline
) {

    public record AgentPerformance(
        String code,
        String name,
        String description,
        boolean active,
        int totalActions,
        int actionsLast24h,
        Instant lastActiveAt,
        List<TrendPoint> trend,
        List<String> recentActivity
    ) {
    }

    public record TrendPoint(String label, int count) {
    }

    /** Cross-agent observability computed from timeline events and triage assessments. */
    public record PipelineObservability(
        Double avgIntakeToAssignSeconds,
        Double avgIntakeToResearchSeconds,
        int researchCoveragePercent,
        double actionsPerPatient,
        List<TrendPoint> hourlyActivity,
        List<TrendPoint> urgencyMix,
        List<TrendPoint> confidenceMix
    ) {
    }
}
