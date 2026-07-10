package com.careflowai.analytics;

import com.careflowai.agent.CareTeamAssignment;
import com.careflowai.agent.CareTeamAssignmentRepository;
import com.careflowai.agent.PatientTimelineEvent;
import com.careflowai.agent.PatientTimelineEventRepository;
import com.careflowai.analytics.ResultsAnalyticsResponse.DoctorLoad;
import com.careflowai.analytics.ResultsAnalyticsResponse.TimeSaved;
import com.careflowai.analytics.ResultsAnalyticsResponse.TrendPoint;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.assessment.UrgencyAssessmentRepository;
import com.careflowai.common.QueueStatus;
import com.careflowai.intake.Intake;
import com.careflowai.intake.IntakeRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResultsAnalyticsService {

    private static final int WINDOW_DAYS = 30;
    private static final int EVENT_SAMPLE = 5000;

    // Per-patient manual-triage baseline (minutes). Kept explicit and surfaced in the
    // response so the time-saved headline is auditable, not a black box.
    private static final int MANUAL_TRIAGE_MIN = 10;
    private static final int MANUAL_RESEARCH_MIN = 15;
    private static final int MANUAL_ASSIGN_MIN = 5;
    private static final int AI_SECONDS_PER_PATIENT = 8;

    private static final List<String> URGENCY_ORDER = List.of("CRITICAL", "HIGH", "MEDIUM", "LOW");
    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("MMM d");

    private final PatientTimelineEventRepository timelineRepository;
    private final UrgencyAssessmentRepository assessmentRepository;
    private final CareTeamAssignmentRepository assignmentRepository;
    private final IntakeRepository intakeRepository;

    public ResultsAnalyticsService(PatientTimelineEventRepository timelineRepository,
                                   UrgencyAssessmentRepository assessmentRepository,
                                   CareTeamAssignmentRepository assignmentRepository,
                                   IntakeRepository intakeRepository) {
        this.timelineRepository = timelineRepository;
        this.assessmentRepository = assessmentRepository;
        this.assignmentRepository = assignmentRepository;
        this.intakeRepository = intakeRepository;
    }

    @Transactional(readOnly = true)
    public ResultsAnalyticsResponse results() {
        ZoneId zone = ZoneId.systemDefault();
        Instant now = Instant.now();
        Instant since = now.minus(Duration.ofDays(WINDOW_DAYS));

        List<PatientTimelineEvent> events = timelineRepository
            .findAllByOrderByCreatedAtDesc(PageRequest.of(0, EVENT_SAMPLE)).stream()
            .filter(event -> event.getCreatedAt().isAfter(since))
            .toList();

        Set<UUID> processed = events.stream()
            .filter(event -> "INTAKE_INGESTED".equals(event.getEventType()))
            .map(event -> event.getPatient().getId())
            .collect(Collectors.toSet());
        Set<UUID> researched = events.stream()
            .filter(event -> "MEDICAL_RESEARCH".equals(event.getEventType()))
            .map(event -> event.getPatient().getId())
            .collect(Collectors.toSet());

        int patientsProcessed = processed.size();
        int agentActions = (int) events.stream().filter(event -> "AGENT".equals(event.getSource())).count();
        int researchBriefings = researched.size();
        int researchCoverage = patientsProcessed == 0
            ? 0
            : (int) Math.round(100.0 * researched.stream().filter(processed::contains).count() / patientsProcessed);

        List<Intake> recentIntakes = intakeRepository.findAll().stream()
            .filter(intake -> intake.getCreatedAt() != null && intake.getCreatedAt().isAfter(since))
            .toList();
        int discharged = (int) recentIntakes.stream()
            .filter(intake -> intake.getCurrentStatus() == QueueStatus.DISCHARGED)
            .count();

        return new ResultsAnalyticsResponse(
            patientsProcessed,
            discharged,
            agentActions,
            researchBriefings,
            researchCoverage,
            dailyThroughput(events, zone),
            urgencyMix(),
            departmentMix(recentIntakes),
            doctorLoad(),
            timeSaved(patientsProcessed)
        );
    }

    /** Intakes per calendar day for the whole window, so empty days still show as zero. */
    private List<TrendPoint> dailyThroughput(List<PatientTimelineEvent> events, ZoneId zone) {
        Map<LocalDate, Integer> byDay = new LinkedHashMap<>();
        LocalDate today = LocalDate.now(zone);
        for (int offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
            byDay.put(today.minusDays(offset), 0);
        }
        events.stream()
            .filter(event -> "INTAKE_INGESTED".equals(event.getEventType()))
            .forEach(event -> {
                LocalDate day = event.getCreatedAt().atZone(zone).toLocalDate();
                if (byDay.containsKey(day)) {
                    byDay.merge(day, 1, Integer::sum);
                }
            });
        return byDay.entrySet().stream()
            .map(entry -> new TrendPoint(entry.getKey().format(DAY_LABEL), entry.getValue()))
            .toList();
    }

    private List<TrendPoint> urgencyMix() {
        List<UrgencyAssessment> assessments = assessmentRepository.findTop200ByOrderByAssessedAtDesc();
        Map<String, Integer> counts = new LinkedHashMap<>();
        URGENCY_ORDER.forEach(category -> counts.put(category, 0));
        for (UrgencyAssessment assessment : assessments) {
            if (assessment.getFinalCategory() != null) {
                counts.merge(assessment.getFinalCategory().name(), 1, Integer::sum);
            }
        }
        return counts.entrySet().stream()
            .map(entry -> new TrendPoint(entry.getKey(), entry.getValue()))
            .toList();
    }

    private List<TrendPoint> departmentMix(List<Intake> recentIntakes) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Intake intake : recentIntakes) {
            String department = intake.getDepartment() == null ? "Unassigned" : intake.getDepartment();
            counts.merge(department, 1, Integer::sum);
        }
        return counts.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
            .map(entry -> new TrendPoint(entry.getKey(), entry.getValue()))
            .toList();
    }

    /** Total patients handled per doctor over all assignments - the load-balance proof. */
    private List<DoctorLoad> doctorLoad() {
        Map<UUID, DoctorLoad> byDoctor = new LinkedHashMap<>();
        Map<UUID, Integer> counts = new LinkedHashMap<>();
        for (CareTeamAssignment assignment : assignmentRepository.findAll()) {
            UUID doctorId = assignment.getAssignedDoctor().getId();
            counts.merge(doctorId, 1, Integer::sum);
            byDoctor.putIfAbsent(doctorId, new DoctorLoad(
                assignment.getAssignedDoctor().getDisplayName(),
                assignment.getAssignedDoctor().getSpecialty(),
                0
            ));
        }
        List<DoctorLoad> loads = new ArrayList<>();
        byDoctor.forEach((doctorId, load) ->
            loads.add(new DoctorLoad(load.name(), load.specialty(), counts.getOrDefault(doctorId, 0))));
        loads.sort((a, b) -> Integer.compare(b.patients(), a.patients()));
        return loads;
    }

    private TimeSaved timeSaved(int patients) {
        int manualPerPatient = MANUAL_TRIAGE_MIN + MANUAL_RESEARCH_MIN + MANUAL_ASSIGN_MIN;
        long manualTotal = (long) manualPerPatient * patients;
        long aiTotal = Math.round((double) AI_SECONDS_PER_PATIENT * patients / 60.0);
        long minutesSaved = Math.max(0, manualTotal - aiTotal);
        double hoursSaved = Math.round(minutesSaved / 6.0) / 10.0;
        return new TimeSaved(
            MANUAL_TRIAGE_MIN,
            MANUAL_RESEARCH_MIN,
            MANUAL_ASSIGN_MIN,
            manualPerPatient,
            AI_SECONDS_PER_PATIENT,
            patients,
            manualTotal,
            aiTotal,
            minutesSaved,
            hoursSaved
        );
    }
}
