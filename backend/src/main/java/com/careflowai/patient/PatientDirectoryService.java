package com.careflowai.patient;

import com.careflowai.agent.CareTeamAssignment;
import com.careflowai.agent.CareTeamAssignmentRepository;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.assessment.UrgencyAssessmentRepository;
import com.careflowai.common.QueueStatus;
import com.careflowai.intake.Intake;
import com.careflowai.intake.IntakeRepository;
import com.careflowai.agent.PatientTimelineEventRepository;
import com.careflowai.agent.dto.PatientTimelineEventResponse;
import com.careflowai.patient.dto.PatientDirectoryEntryResponse;
import com.careflowai.patient.dto.PatientDirectoryEntryResponse.PatientFileResponse;
import com.careflowai.patient.dto.PatientStoryResponse;
import com.careflowai.queue.QueueEntry;
import com.careflowai.queue.QueueEntryRepository;
import com.careflowai.thread.PatientThreadComment;
import com.careflowai.thread.PatientThreadCommentRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PatientDirectoryService {

    private final PatientRepository patientRepository;
    private final IntakeRepository intakeRepository;
    private final UrgencyAssessmentRepository assessmentRepository;
    private final QueueEntryRepository queueEntryRepository;
    private final CareTeamAssignmentRepository assignmentRepository;
    private final PatientThreadCommentRepository threadCommentRepository;
    private final PatientTimelineEventRepository timelineRepository;

    public PatientDirectoryService(PatientRepository patientRepository,
                                   IntakeRepository intakeRepository,
                                   UrgencyAssessmentRepository assessmentRepository,
                                   QueueEntryRepository queueEntryRepository,
                                   CareTeamAssignmentRepository assignmentRepository,
                                   PatientThreadCommentRepository threadCommentRepository,
                                   PatientTimelineEventRepository timelineRepository) {
        this.patientRepository = patientRepository;
        this.intakeRepository = intakeRepository;
        this.assessmentRepository = assessmentRepository;
        this.queueEntryRepository = queueEntryRepository;
        this.assignmentRepository = assignmentRepository;
        this.threadCommentRepository = threadCommentRepository;
        this.timelineRepository = timelineRepository;
    }

    @Transactional(readOnly = true)
    public PatientStoryResponse story(UUID patientId) {
        Patient patient = patientRepository.findById(patientId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Patient not found."));
        Intake intake = intakeRepository.findTopByPatientIdOrderByCreatedAtDesc(patientId).orElse(null);
        UrgencyAssessment assessment = assessmentRepository
            .findTopByPatientIdOrderByAssessedAtDesc(patientId).orElse(null);
        QueueEntry queueEntry = queueEntryRepository.findByPatientId(patientId).orElse(null);
        CareTeamAssignment assignment = assignmentRepository
            .findTopByPatientIdAndActiveTrueOrderByAssignedAtDesc(patientId).orElse(null);
        List<PatientThreadComment> comments = threadCommentRepository.findByPatientIdOrderByCreatedAtAsc(patientId);

        PatientStoryResponse.Assessment assessmentStory = assessment == null ? null
            : new PatientStoryResponse.Assessment(
                assessment.getFinalCategory(),
                assessment.getFinalScore(),
                assessment.getSuggestedDiagnosis(),
                assessment.getMedicalAttentionNote(),
                assessment.getStructuredSymptomSummary(),
                assessment.getStaffFacingExplanation(),
                assessment.getConfidenceLevel(),
                List.copyOf(assessment.getScoreFactors()),
                List.copyOf(assessment.getRedFlagIndicators()),
                List.copyOf(assessment.getMissingOrAmbiguousDetails())
            );

        PatientStoryResponse.Assignment assignmentStory = assignment == null ? null
            : new PatientStoryResponse.Assignment(
                assignment.getAssignedDoctor().getDisplayName(),
                assignment.getAssignedDoctor().getSpecialty(),
                assignment.getAssignmentReason(),
                assignment.getAssignedAt()
            );

        // The Medical Research Agent writes its briefing as a thread comment with
        // article links attached - surface the latest one as the research story.
        PatientStoryResponse.Research researchStory = comments.stream()
            .filter(comment -> "Medical Research Agent".equals(comment.getAuthorName()))
            .reduce((first, second) -> second)
            .map(comment -> new PatientStoryResponse.Research(
                comment.getBody(),
                comment.getAttachments().stream()
                    .map(attachment -> new PatientStoryResponse.Research.Citation(
                        attachment.getFileName(), attachment.getUrl()))
                    .toList()
            ))
            .orElse(null);

        List<PatientTimelineEventResponse> timeline = timelineRepository
            .findByPatientIdInOrderByCreatedAtDesc(List.of(patientId), PageRequest.of(0, 60)).stream()
            .map(PatientTimelineEventResponse::from)
            .toList();

        List<PatientFileResponse> files = comments.stream()
            .flatMap(comment -> comment.getAttachments().stream()
                .map(attachment -> new PatientFileResponse(
                    attachment.getFileName(),
                    attachment.getFileType(),
                    attachment.getUrl(),
                    comment.getAuthorName(),
                    comment.getCreatedAt()
                )))
            .toList();

        return new PatientStoryResponse(
            patient.getId(),
            patient.getDisplayId(),
            patient.getAgeBand(),
            intake != null ? intake.getDepartment() : null,
            intake != null ? intake.getChiefComplaint() : null,
            intake != null ? List.copyOf(intake.getStructuredSymptoms()) : List.of(),
            queueEntry != null ? queueEntry.getStatus() : intake != null ? intake.getCurrentStatus() : null,
            intake != null ? intake.getArrivalTimestamp() : patient.getCreatedAt(),
            assessmentStory,
            assignmentStory,
            researchStory,
            timeline,
            files
        );
    }

    @Transactional(readOnly = true)
    public List<PatientDirectoryEntryResponse> directory(String query) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return patientRepository.findAll().stream()
            .map(this::toEntry)
            .filter(entry -> matches(entry, normalizedQuery))
            .sorted(Comparator.comparing(
                PatientDirectoryEntryResponse::arrivedAt,
                Comparator.nullsLast(Comparator.reverseOrder())
            ))
            .toList();
    }

    private PatientDirectoryEntryResponse toEntry(Patient patient) {
        Intake intake = intakeRepository.findTopByPatientIdOrderByCreatedAtDesc(patient.getId()).orElse(null);
        UrgencyAssessment assessment = assessmentRepository
            .findTopByPatientIdOrderByAssessedAtDesc(patient.getId()).orElse(null);
        QueueEntry queueEntry = queueEntryRepository.findByPatientId(patient.getId()).orElse(null);
        CareTeamAssignment assignment = assignmentRepository
            .findTopByPatientIdAndActiveTrueOrderByAssignedAtDesc(patient.getId()).orElse(null);

        QueueStatus status = queueEntry != null
            ? queueEntry.getStatus()
            : intake != null ? intake.getCurrentStatus() : null;
        Instant arrivedAt = intake != null ? intake.getArrivalTimestamp() : patient.getCreatedAt();

        List<PatientFileResponse> files = threadCommentRepository
            .findByPatientIdOrderByCreatedAtAsc(patient.getId()).stream()
            .flatMap(comment -> comment.getAttachments().stream()
                .map(attachment -> new PatientFileResponse(
                    attachment.getFileName(),
                    attachment.getFileType(),
                    attachment.getUrl(),
                    comment.getAuthorName(),
                    comment.getCreatedAt()
                )))
            .toList();

        return new PatientDirectoryEntryResponse(
            patient.getId(),
            patient.getDisplayId(),
            patient.getAgeBand(),
            intake != null ? intake.getDepartment() : null,
            intake != null ? intake.getChiefComplaint() : null,
            status,
            queueEntry != null
                ? queueEntry.getUrgencyCategory()
                : assessment != null ? assessment.getFinalCategory() : null,
            queueEntry != null
                ? Integer.valueOf(queueEntry.getUrgencyScore())
                : assessment != null ? Integer.valueOf(assessment.getFinalScore()) : null,
            assessment != null ? assessment.getSuggestedDiagnosis() : null,
            assessment != null ? assessment.getMedicalAttentionNote() : null,
            assignment != null ? assignment.getAssignedDoctor().getDisplayName() : null,
            arrivedAt,
            files
        );
    }

    private boolean matches(PatientDirectoryEntryResponse entry, String query) {
        if (!StringUtils.hasText(query)) {
            return true;
        }
        return containsIgnoreCase(entry.patientDisplayId(), query)
            || containsIgnoreCase(entry.chiefComplaint(), query)
            || containsIgnoreCase(entry.department(), query)
            || containsIgnoreCase(entry.suggestedDiagnosis(), query)
            || containsIgnoreCase(entry.assignedDoctor(), query)
            || (entry.currentStatus() != null
                && entry.currentStatus().name().toLowerCase(Locale.ROOT).contains(query));
    }

    private boolean containsIgnoreCase(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }
}
