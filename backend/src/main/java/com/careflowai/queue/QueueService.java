package com.careflowai.queue;

import com.careflowai.agent.CareTeamAssignment;
import com.careflowai.agent.PatientAgentService;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.assessment.UrgencyAssessmentRepository;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.StaffRole;
import com.careflowai.common.UrgencyCategory;
import com.careflowai.intake.Intake;
import com.careflowai.patient.Patient;
import com.careflowai.queue.dto.AssignDoctorRequest;
import com.careflowai.queue.dto.OverridePriorityRequest;
import com.careflowai.queue.dto.QueueEntryResponse;
import com.careflowai.queue.dto.RemoveQueueEntryRequest;
import com.careflowai.queue.dto.UpdatePlacementRequest;
import com.careflowai.queue.dto.UpdateStatusRequest;
import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserService;
import com.careflowai.vector.SimpleIntakeVectorStore;
import java.time.Instant;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class QueueService {

    private final QueueEntryRepository queueEntryRepository;
    private final PriorityOverrideRepository priorityOverrideRepository;
    private final UrgencyAssessmentRepository assessmentRepository;
    private final StaffUserService staffUserService;
    private final PatientAgentService patientAgentService;
    private final SimpleIntakeVectorStore vectorStore;

    public QueueService(QueueEntryRepository queueEntryRepository,
                        PriorityOverrideRepository priorityOverrideRepository,
                        UrgencyAssessmentRepository assessmentRepository,
                        StaffUserService staffUserService,
                        PatientAgentService patientAgentService,
                        SimpleIntakeVectorStore vectorStore) {
        this.queueEntryRepository = queueEntryRepository;
        this.priorityOverrideRepository = priorityOverrideRepository;
        this.assessmentRepository = assessmentRepository;
        this.staffUserService = staffUserService;
        this.patientAgentService = patientAgentService;
        this.vectorStore = vectorStore;
    }

    @Transactional
    public QueueEntry upsertFromAssessment(Patient patient, Intake intake, UrgencyAssessment assessment) {
        QueueEntry entry = queueEntryRepository.findByPatientId(patient.getId())
            .orElseGet(() -> new QueueEntry(patient, intake, assessment.getFinalCategory(), assessment.getFinalScore(),
                intake.getArrivalTimestamp(), intake.getDepartment(), intake.getCurrentStatus()));
        entry.applyCalculatedPriority(assessment.getFinalCategory(), assessment.getFinalScore(), intake);
        QueueEntry saved = queueEntryRepository.save(entry);
        refreshVectorContext(saved, assessment);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<QueueEntryResponse> getQueue(UrgencyCategory category, String department, QueueStatus status) {
        Instant now = Instant.now();
        return sortedEntries(now).stream()
            .filter(entry -> category == null || entry.getUrgencyCategory() == category)
            .filter(entry -> !StringUtils.hasText(department) || entry.getDepartment().equalsIgnoreCase(department))
            .filter(entry -> status == null || entry.getStatus() == status)
            .map(entry -> QueueEntryResponse.from(entry, now, patientAgentService.currentAssignment(entry.getPatient().getId()).orElse(null)))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<QueueEntry> sortedEntries(Instant now) {
        return queueEntryRepository.findAll().stream()
            .sorted(queueComparator(now))
            .toList();
    }

    public static Comparator<QueueEntry> queueComparator(Instant now) {
        return Comparator
            .comparingInt((QueueEntry entry) -> entry.getUrgencyCategory().getSortOrder())
            .thenComparingInt(entry -> entry.isStaffEscalated() ? 0 : 1)
            .thenComparingInt(entry -> waitReshuffleBand(entry, now))
            .thenComparing(Comparator.comparingInt(QueueEntry::getUrgencyScore).reversed())
            .thenComparing(QueueEntry::getWaitingSince)
            .thenComparing(QueueEntry::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    public static int waitReshuffleBand(QueueEntry entry, Instant now) {
        long waitingMinutes = Math.max(0, Duration.between(entry.getWaitingSince(), now).toMinutes());
        if (waitingMinutes >= 40) {
            return 0;
        }
        if (waitingMinutes >= 30) {
            return 1;
        }
        return 2;
    }

    @Transactional
    public QueueEntryResponse overridePriority(UUID patientId, OverridePriorityRequest request) {
        StaffUser actor = staffUserService.resolveActor(request.actorName(), request.actorRole(), null);
        if (!actor.getRole().canOverridePriority()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Actor role cannot override priority.");
        }

        QueueEntry entry = queueEntryRepository.findByPatientId(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Queue entry not found."));
        priorityOverrideRepository.save(new PriorityOverride(
            entry.getPatient(),
            actor,
            entry.getUrgencyCategory(),
            entry.getUrgencyScore(),
            request.newCategory(),
            request.newScore(),
            request.reason(),
            request.note()
        ));
        entry.applyStaffOverride(request.newCategory(), request.newScore());
        QueueEntry saved = queueEntryRepository.save(entry);
        patientAgentService.handlePriorityOverridden(saved, actor);
        refreshVectorContext(saved);
        return toResponse(saved);
    }

    @Transactional
    public QueueEntryResponse updateStatus(UUID patientId, UpdateStatusRequest request) {
        StaffUser actor = staffUserService.resolveActor(request.actorName(), request.actorRole(), null);
        if (!actor.getRole().canUpdateQueueStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Actor role cannot update queue status.");
        }

        QueueEntry entry = queueEntryRepository.findByPatientId(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Queue entry not found."));
        entry.updateStatus(request.status());
        QueueEntry saved = queueEntryRepository.save(entry);
        patientAgentService.handleStatusChanged(saved, actor);
        refreshVectorContext(saved);
        return toResponse(saved);
    }

    @Transactional
    public QueueEntryResponse updatePlacement(UUID patientId, UpdatePlacementRequest request) {
        StaffUser actor = staffUserService.resolveActor(request.actorName(), request.actorRole(), request.department());
        if (!actor.getRole().canUpdateQueueStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Actor role cannot update queue placement.");
        }

        QueueEntry entry = queueEntryRepository.findByPatientId(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Queue entry not found."));
        entry.updatePlacement(request.status(), request.department().trim());
        QueueEntry saved = queueEntryRepository.save(entry);
        patientAgentService.handleStatusChanged(saved, actor);
        refreshVectorContext(saved);
        return toResponse(saved);
    }

    @Transactional
    public QueueEntryResponse assignDoctor(UUID patientId, AssignDoctorRequest request) {
        StaffUser actor = staffUserService.resolveActor(request.actorName(), request.actorRole(), null);
        StaffUser doctor = staffUserService.getByLookup(request.doctorLookup());
        if (doctor.getRole() != StaffRole.DOCTOR || !doctor.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Assigned staff member must be an active doctor.");
        }
        QueueEntry entry = queueEntryRepository.findByPatientId(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Queue entry not found."));
        CareTeamAssignment assignment = patientAgentService.assignDoctor(entry, doctor, actor, request.note());
        refreshVectorContext(entry, null, assignment);
        return QueueEntryResponse.from(entry, Instant.now(), assignment);
    }

    @Transactional
    public void removeFromQueue(UUID patientId, RemoveQueueEntryRequest request) {
        RemoveQueueEntryRequest safeRequest = request == null ? new RemoveQueueEntryRequest(null, null, null) : request;
        StaffUser actor = staffUserService.resolveActor(safeRequest.actorName(), safeRequest.actorRole(), null);
        QueueEntry entry = queueEntryRepository.findByPatientId(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Queue entry not found."));
        if (entry.getStatus() == QueueStatus.IN_TREATMENT || entry.getStatus() == QueueStatus.DISCHARGED) {
            entry.updateStatus(QueueStatus.DISCHARGED);
        } else {
            entry.updateStatus(QueueStatus.LEFT_WITHOUT_BEING_SEEN);
        }
        patientAgentService.handleRemovedFromQueue(entry, actor, safeRequest.reason());
        refreshVectorContext(entry);
        queueEntryRepository.delete(entry);
    }

    @Transactional(readOnly = true)
    public long overrideCount() {
        return priorityOverrideRepository.count();
    }

    private QueueEntryResponse toResponse(QueueEntry entry) {
        return QueueEntryResponse.from(
            entry,
            Instant.now(),
            patientAgentService.currentAssignment(entry.getPatient().getId()).orElse(null)
        );
    }

    private void refreshVectorContext(QueueEntry entry) {
        refreshVectorContext(entry, null, null);
    }

    private void refreshVectorContext(QueueEntry entry, UrgencyAssessment knownAssessment) {
        refreshVectorContext(entry, knownAssessment, null);
    }

    private void refreshVectorContext(QueueEntry entry, UrgencyAssessment knownAssessment, CareTeamAssignment knownAssignment) {
        UrgencyAssessment assessment = knownAssessment == null
            ? assessmentRepository.findTopByPatientIdOrderByAssessedAtDesc(entry.getPatient().getId()).orElse(null)
            : knownAssessment;
        CareTeamAssignment assignment = knownAssignment == null
            ? patientAgentService.currentAssignment(entry.getPatient().getId()).orElse(null)
            : knownAssignment;
        String assignmentSummary = assignment == null
            ? null
            : "Active doctor assignment: %s (%s). Reason: %s.".formatted(
                assignment.getAssignedDoctor().getDisplayName(),
                assignment.getAssignedDoctor().getStaffCode(),
                assignment.getAssignmentReason()
            );
        vectorStore.indexQueueEntry(entry, assessment, assignmentSummary);
    }
}
