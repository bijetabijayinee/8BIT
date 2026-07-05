package com.careflowai.agent;

import com.careflowai.agent.dto.AgentPerformanceResponse;
import com.careflowai.agent.dto.AgentPerformanceResponse.AgentPerformance;
import com.careflowai.agent.dto.AgentPerformanceResponse.TrendPoint;
import com.careflowai.assessment.UrgencyAssessment;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
    private final com.careflowai.assessment.UrgencyAssessmentRepository assessmentRepository;

    public AgentPerformanceService(PatientTimelineEventRepository timelineRepository,
                                   SystemAgentService systemAgentService,
                                   com.careflowai.assessment.UrgencyAssessmentRepository assessmentRepository) {
        this.timelineRepository = timelineRepository;
        this.systemAgentService = systemAgentService;
        this.assessmentRepository = assessmentRepository;
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
        return new AgentPerformanceResponse(
            (int) patientsProcessed,
            totalActions,
            agents,
            buildObservability(events, (int) patientsProcessed, totalActions, now)
        );
    }

    /**
     * Cross-agent pipeline analytics: latency from intake to key agent decisions,
     * research coverage, hourly load, and the triage LLM's urgency/confidence mix.
     */
    private AgentPerformanceResponse.PipelineObservability buildObservability(List<PatientTimelineEvent> events,
                                                                              int patientsProcessed,
                                                                              int totalActions,
                                                                              Instant now) {
        Map<UUID, Instant> intakeAt = firstEventPerPatient(events, "INTAKE_INGESTED");
        Map<UUID, Instant> assignedAt = firstEventPerPatient(events, "DOCTOR_ASSIGNED");
        Map<UUID, Instant> researchedAt = firstEventPerPatient(events, "MEDICAL_RESEARCH");

        Double avgIntakeToAssign = averageLatencySeconds(intakeAt, assignedAt);
        Double avgIntakeToResearch = averageLatencySeconds(intakeAt, researchedAt);
        int researchCoverage = intakeAt.isEmpty()
            ? 0
            : (int) Math.round(100.0 * researchedAt.keySet().stream().filter(intakeAt::containsKey).count()
                / intakeAt.size());
        double actionsPerPatient = patientsProcessed == 0
            ? 0
            : Math.round(10.0 * totalActions / patientsProcessed) / 10.0;

        Set<String> agentEventTypes = AGENTS.stream()
            .flatMap(spec -> spec.eventTypes().stream())
            .collect(java.util.stream.Collectors.toSet());
        List<PatientTimelineEvent> agentEvents = events.stream()
            .filter(event -> agentEventTypes.contains(event.getEventType()))
            .toList();

        List<UrgencyAssessment> assessments = assessmentRepository.findTop200ByOrderByAssessedAtDesc();
        List<TrendPoint> urgencyMix = distribution(assessments, assessment ->
            assessment.getFinalCategory() == null ? null : assessment.getFinalCategory().name());
        List<TrendPoint> confidenceMix = distribution(assessments, assessment ->
            assessment.getConfidenceLevel() == null ? null : assessment.getConfidenceLevel().name());

        return new AgentPerformanceResponse.PipelineObservability(
            avgIntakeToAssign,
            avgIntakeToResearch,
            researchCoverage,
            actionsPerPatient,
            buildTrend(agentEvents, now),
            urgencyMix,
            confidenceMix
        );
    }

    private Map<UUID, Instant> firstEventPerPatient(List<PatientTimelineEvent> events, String eventType) {
        Map<UUID, Instant> result = new java.util.HashMap<>();
        for (PatientTimelineEvent event : events) {
            if (eventType.equals(event.getEventType())) {
                result.merge(event.getPatient().getId(), event.getCreatedAt(),
                    (a, b) -> a.isBefore(b) ? a : b);
            }
        }
        return result;
    }

    private Double averageLatencySeconds(Map<UUID, Instant> startAt, Map<UUID, Instant> endAt) {
        List<Long> latencies = endAt.entrySet().stream()
            .filter(entry -> startAt.containsKey(entry.getKey()))
            .map(entry -> Duration.between(startAt.get(entry.getKey()), entry.getValue()).getSeconds())
            .filter(seconds -> seconds >= 0)
            .toList();
        if (latencies.isEmpty()) {
            return null;
        }
        return latencies.stream().mapToLong(Long::longValue).average().orElse(0);
    }

    private List<TrendPoint> distribution(List<UrgencyAssessment> assessments,
                                          java.util.function.Function<UrgencyAssessment, String> classifier) {
        Map<String, Integer> counts = new java.util.LinkedHashMap<>();
        for (UrgencyAssessment assessment : assessments) {
            String key = classifier.apply(assessment);
            if (key != null) {
                counts.merge(key, 1, Integer::sum);
            }
        }
        return counts.entrySet().stream()
            .map(entry -> new TrendPoint(entry.getKey(), entry.getValue()))
            .toList();
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
