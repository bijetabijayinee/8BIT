package com.careflowai.agent.dto;

import java.time.Instant;
import java.util.List;

public record AgentPerformanceResponse(
    int patientsProcessed,
    int agentActionsTotal,
    List<AgentPerformance> agents
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
}
