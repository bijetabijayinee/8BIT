package com.careflowai.agent;

import com.careflowai.agent.dto.AgentPerformanceResponse;
import com.careflowai.agent.dto.AgentPerformanceResponse.AgentPerformance;
import com.careflowai.agent.dto.AgentPerformanceResponse.TrendPoint;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentPerformanceService {

    private static final int SAMPLE_SIZE = 600;
    private static final int TREND_BUCKETS = 6;
    private static final Duration BUCKET_WIDTH = Duration.ofHours(2);

    private record AgentSpec(String code, String name, String description, Set<String> eventTypes) {
    }

    private static final List<AgentSpec> AGENTS = List.of(
        new AgentSpec("PRIORITY_AGENT", "Priority Agent",
            "Scores urgency and keeps the queue ordered under time pressure.",
            Set.of("QUEUE_SORTED", "PRIORITY_OVERRIDDEN")),
        new AgentSpec("ASSIGNMENT_AGENT", "Assignment Agent",
            "Matches each patient to the best available doctor.",
            Set.of("DOCTOR_ASSIGNED")),
        new AgentSpec("NOTIFICATION_AGENT", "Notification Agent",
            "Notifies the right care team members and publishes flashcards.",
            Set.of("FLASHCARDS_CREATED", "STATUS_CHANGED")),
        new AgentSpec("RESEARCH_AGENT", "Medical Research Agent",
            "Researches the condition online and briefs the care team.",
            Set.of("MEDICAL_RESEARCH"))
    );

    private final PatientTimelineEventRepository timelineRepository;
    private final SystemAgentService systemAgentService;

    public AgentPerformanceService(PatientTimelineEventRepository timelineRepository,
                                   SystemAgentService systemAgentService) {
        this.timelineRepository = timelineRepository;
        this.systemAgentService = systemAgentService;
    }

    @Transactional(readOnly = true)
    public AgentPerformanceResponse performance() {
        List<PatientTimelineEvent> events = timelineRepository
            .findAllByOrderByCreatedAtDesc(PageRequest.of(0, SAMPLE_SIZE));
        Instant now = Instant.now();
        Instant since24h = now.minus(Duration.ofHours(24));

        long patientsProcessed = events.stream()
            .filter(event -> "INTAKE_INGESTED".equals(event.getEventType()))
            .map(event -> event.getPatient().getId())
            .distinct()
            .count();

        List<AgentPerformance> agents = AGENTS.stream()
            .map(spec -> toPerformance(spec, events, now, since24h))
            .toList();

        int totalActions = agents.stream().mapToInt(AgentPerformance::totalActions).sum();
        return new AgentPerformanceResponse((int) patientsProcessed, totalActions, agents);
    }

    private AgentPerformance toPerformance(AgentSpec spec, List<PatientTimelineEvent> events,
                                           Instant now, Instant since24h) {
        List<PatientTimelineEvent> agentEvents = events.stream()
            .filter(event -> spec.eventTypes().contains(event.getEventType()))
            .toList();

        int total = agentEvents.size();
        int last24h = (int) agentEvents.stream()
            .filter(event -> event.getCreatedAt().isAfter(since24h))
            .count();
        Instant lastActiveAt = agentEvents.stream()
            .map(PatientTimelineEvent::getCreatedAt)
            .max(Instant::compareTo)
            .orElse(null);

        List<TrendPoint> trend = buildTrend(agentEvents, now);
        List<String> recentActivity = agentEvents.stream()
            .limit(3)
            .map(PatientTimelineEvent::getDescription)
            .toList();

        return new AgentPerformance(
            spec.code(),
            spec.name(),
            spec.description(),
            systemAgentService.isActive(spec.code()),
            total,
            last24h,
            lastActiveAt,
            trend,
            recentActivity
        );
    }

    private List<TrendPoint> buildTrend(List<PatientTimelineEvent> agentEvents, Instant now) {
        int[] buckets = new int[TREND_BUCKETS];
        long windowSeconds = BUCKET_WIDTH.getSeconds() * TREND_BUCKETS;
        Instant windowStart = now.minusSeconds(windowSeconds);
        for (PatientTimelineEvent event : agentEvents) {
            Instant createdAt = event.getCreatedAt();
            if (createdAt.isBefore(windowStart)) {
                continue;
            }
            long secondsFromStart = Duration.between(windowStart, createdAt).getSeconds();
            int index = (int) (secondsFromStart / BUCKET_WIDTH.getSeconds());
            if (index < 0) {
                index = 0;
            }
            if (index >= TREND_BUCKETS) {
                index = TREND_BUCKETS - 1;
            }
            buckets[index]++;
        }
        List<TrendPoint> points = new java.util.ArrayList<>();
        for (int i = 0; i < TREND_BUCKETS; i++) {
            int hoursAgo = (TREND_BUCKETS - i) * (int) BUCKET_WIDTH.toHours();
            points.add(new TrendPoint("-" + hoursAgo + "h", buckets[i]));
        }
        return points;
    }
}
