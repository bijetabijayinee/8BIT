package com.careflowai.agent;

import com.careflowai.ai.AiDoctorAssignmentOutput;
import com.careflowai.ai.AiDoctorAssignmentService;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.StaffRole;
import com.careflowai.common.UrgencyCategory;
import com.careflowai.agent.dto.AgentDashboardResponse;
import com.careflowai.agent.dto.PatientFlashcardResponse;
import com.careflowai.agent.dto.PatientTimelineEventResponse;
import com.careflowai.agent.dto.ResolveFlashcardRequest;
import com.careflowai.intake.Intake;
import com.careflowai.notification.NotificationService;
import com.careflowai.patient.Patient;
import com.careflowai.queue.QueueEntry;
import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserRepository;
import com.careflowai.staff.StaffUserService;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PatientAgentService {

    private static final int CARD_LIMIT = 12;
    private static final int TIMELINE_LIMIT = 30;

    private final CareTeamAssignmentRepository assignmentRepository;
    private final PatientFlashcardRepository flashcardRepository;
    private final PatientTimelineEventRepository timelineRepository;
    private final StaffUserRepository staffUserRepository;
    private final StaffUserService staffUserService;
    private final SystemAgentService systemAgentService;
    private final AiDoctorAssignmentService aiDoctorAssignmentService;
    private final WorkflowStreamService workflowStream;
    private final NotificationService notificationService;

    public PatientAgentService(CareTeamAssignmentRepository assignmentRepository,
                               PatientFlashcardRepository flashcardRepository,
                               PatientTimelineEventRepository timelineRepository,
                               StaffUserRepository staffUserRepository,
                               StaffUserService staffUserService,
                               SystemAgentService systemAgentService,
                               AiDoctorAssignmentService aiDoctorAssignmentService,
                               WorkflowStreamService workflowStream,
                               NotificationService notificationService) {
        this.assignmentRepository = assignmentRepository;
        this.flashcardRepository = flashcardRepository;
        this.timelineRepository = timelineRepository;
        this.staffUserRepository = staffUserRepository;
        this.staffUserService = staffUserService;
        this.systemAgentService = systemAgentService;
        this.aiDoctorAssignmentService = aiDoctorAssignmentService;
        this.workflowStream = workflowStream;
        this.notificationService = notificationService;
    }

    @Transactional
    public void handleIntakeIngested(Patient patient, Intake intake, UrgencyAssessment assessment, QueueEntry queueEntry,
                                     StaffUser intakeActor, String researchBriefing) {
        AssignmentDecision assignmentDecision = systemAgentService.isActive("ASSIGNMENT_AGENT")
            ? resolveAssignedDoctor(intake, assessment, intakeActor, researchBriefing)
            : new AssignmentDecision(intakeActor, "Assignment Agent inactive; intake actor retained.");
        CareTeamAssignment assignment = assignmentRepository.save(new CareTeamAssignment(
            patient,
            intake,
            assignmentDecision.doctor(),
            assignmentDecision.reason()
        ));

        appendEvent(patient, intake, intakeActor, "INTAKE_INGESTED", "Intake ingested",
            "%s created the intake for %s.".formatted(displayName(intakeActor), patient.getDisplayId()), "STAFF");
        if (systemAgentService.isActive("PRIORITY_AGENT")) {
            appendEvent(patient, intake, null, "QUEUE_SORTED", "Patient sorted",
                "Priority Agent placed %s as %s with score %d.".formatted(
                    patient.getDisplayId(),
                    assessment.getFinalCategory(),
                    assessment.getFinalScore()
                ), "AGENT");
        }
        StaffUser assignedDoctor = assignmentDecision.doctor();
        workflowStream.publish(patient.getDisplayId(), "DOCTOR_ASSIGNED", "Assignment Agent", "Doctor assigned",
            "%s assigned to %s. %s".formatted(
                assignedDoctor.getDisplayName(),
                patient.getDisplayId(),
                assignmentDecision.reason()
            ),
            assignmentReasoning(assignedDoctor, assessment, intake, assignmentDecision.reason(), researchBriefing));
        if (systemAgentService.isActive("NOTIFICATION_AGENT")) {
            appendEvent(patient, intake, assignedDoctor, "DOCTOR_ASSIGNED", "Doctor assigned",
                "Notification Agent assigned %s to %s. %s".formatted(
                    assignedDoctor.getDisplayName(),
                    patient.getDisplayId(),
                    assignmentDecision.reason()
                ), "AGENT");
        }

        refreshFlashcards(patient, intake, queueEntry, assignment, intakeActor);
        if (systemAgentService.isActive("NOTIFICATION_AGENT")) {
            appendEvent(patient, intake, null, "FLASHCARDS_CREATED", "Flashcards created",
                "Agent published care-team flashcards for the assigned doctor and intake team.", "AGENT");
            dispatchIntakeNotifications(patient, intake, queueEntry, assignedDoctor, intakeActor, assignmentDecision.reason());
            workflowStream.publish(patient.getDisplayId(), "DOCTOR_NOTIFIED", "Notification Agent", "Care team notified",
                "Notified %s, the %s intake desk, and triage nurses.".formatted(
                    assignedDoctor.getDisplayName(),
                    intake.getDepartment()
                ),
                notificationReasoning(assignedDoctor, queueEntry, intake));
        } else {
            workflowStream.publish(patient.getDisplayId(), "DOCTOR_NOTIFIED", "Notification Agent", "Notification skipped",
                "Notification Agent is inactive; no care-team notifications were published.",
                "The Notification Agent is turned off in the System Agents panel, so no in-app notifications were sent for this patient.");
        }
    }

    private void dispatchIntakeNotifications(Patient patient, Intake intake, QueueEntry queueEntry,
                                             StaffUser assignedDoctor, StaffUser intakeActor, String assignmentReason) {
        String urgencyLine = "%s (score %d) in %s".formatted(
            queueEntry.getUrgencyCategory(), queueEntry.getUrgencyScore(), intake.getDepartment());

        // Assigned doctor: a personal, patient-scoped alert.
        notificationService.notifyStaff(
            StaffRole.DOCTOR,
            assignedDoctor.getId(),
            patient.getId(),
            patient.getDisplayId(),
            "Notification Agent",
            "ASSIGNMENT",
            "New patient assigned: " + patient.getDisplayId(),
            "You have been assigned %s - %s. Complaint: %s. %s".formatted(
                patient.getDisplayId(), urgencyLine, intake.getChiefComplaint(), assignmentReason)
        );

        // Intake desk for this department.
        notificationService.notifyStaff(
            StaffRole.INTAKE_STAFF,
            null,
            patient.getId(),
            patient.getDisplayId(),
            "Notification Agent",
            "INTAKE",
            "%s routed to %s".formatted(patient.getDisplayId(), assignedDoctor.getDisplayName()),
            "Agents sorted %s as %s and assigned %s. No further intake action needed unless details change.".formatted(
                patient.getDisplayId(), urgencyLine, assignedDoctor.getDisplayName())
        );

        // Triage nurses see every new arrival and its urgency.
        notificationService.notifyStaff(
            StaffRole.TRIAGE_NURSE,
            null,
            patient.getId(),
            patient.getDisplayId(),
            "Notification Agent",
            "TRIAGE",
            "New arrival: %s - %s".formatted(patient.getDisplayId(), queueEntry.getUrgencyCategory()),
            "%s arrived and was triaged to %s. Watch the queue for wait-time escalation.".formatted(
                patient.getDisplayId(), urgencyLine)
        );
    }

    private String assignmentReasoning(StaffUser doctor, UrgencyAssessment assessment, Intake intake, String reason,
                                       String researchBriefing) {
        String specialty = StringUtils.hasText(doctor.getSpecialty()) ? doctor.getSpecialty() : "general coverage";
        String researchLine = StringUtils.hasText(researchBriefing)
            ? "- It also read the Medical Research Agent's briefing on the condition before choosing.\n"
            : "";
        return ("""
            The Assignment Agent compared the patient's needs against the active doctor roster.

            - Patient needs: %s urgency, complaint "%s", department %s
            - Weighed: specialty fit, department match, urgency, symptoms, risk flags, vitals
            %s
            Decision: %s (%s).
            Why: %s""")
            .formatted(
                assessment.getFinalCategory(),
                intake.getChiefComplaint(),
                intake.getDepartment(),
                researchLine,
                doctor.getDisplayName(),
                specialty,
                reason
            );
    }

    private String notificationReasoning(StaffUser doctor, QueueEntry queueEntry, Intake intake) {
        return ("""
            The Notification Agent decided who needs to know about this patient and sent targeted in-app alerts:

            - %s (assigned doctor): a personal alert to start reviewing the case.
            - %s intake desk: confirmation that agents finished routing.
            - Triage nurses: a new-arrival alert with the %s urgency so they can watch wait times.

            Each recipient sees only what is relevant to their role on their home page.""")
            .formatted(
                doctor.getDisplayName(),
                intake.getDepartment(),
                queueEntry.getUrgencyCategory()
            );
    }

    @Transactional
    public void handleStatusChanged(QueueEntry entry, StaffUser actor) {
        appendEvent(entry.getPatient(), entry.getIntake(), actor, "STATUS_CHANGED", "Queue status updated",
            "%s moved %s to %s.".formatted(displayName(actor), entry.getPatient().getDisplayId(), entry.getStatus()),
            "STAFF");
        refreshFlashcardsForEntry(entry, actor);
    }

    @Transactional
    public CareTeamAssignment assignDoctor(QueueEntry entry, StaffUser doctor, StaffUser actor, String note) {
        assignmentRepository.findByPatientIdAndActiveTrue(entry.getPatient().getId())
            .forEach(CareTeamAssignment::deactivate);
        String reason = StringUtils.hasText(note)
            ? truncate(note.trim())
            : truncate("%s assigned %s to %s from the queue.".formatted(
                displayName(actor),
                doctor.getDisplayName(),
                entry.getPatient().getDisplayId()
            ));
        CareTeamAssignment assignment = assignmentRepository.save(new CareTeamAssignment(
            entry.getPatient(),
            entry.getIntake(),
            doctor,
            reason
        ));
        appendEvent(entry.getPatient(), entry.getIntake(), actor, "DOCTOR_ASSIGNED", "Doctor assigned",
            "%s assigned %s to %s.".formatted(displayName(actor), doctor.getDisplayName(), entry.getPatient().getDisplayId()),
            "STAFF");
        refreshFlashcards(entry.getPatient(), entry.getIntake(), entry, assignment, actor);
        return assignment;
    }

    @Transactional
    public void handleRemovedFromQueue(QueueEntry entry, StaffUser actor, String reason) {
        assignmentRepository.findByPatientIdAndActiveTrue(entry.getPatient().getId())
            .forEach(CareTeamAssignment::deactivate);
        String detail = StringUtils.hasText(reason) ? reason.trim() : "No reason recorded.";
        appendEvent(entry.getPatient(), entry.getIntake(), actor, "QUEUE_REMOVED", "Removed from queue",
            "%s removed %s from the queue. %s".formatted(displayName(actor), entry.getPatient().getDisplayId(), detail),
            "STAFF");
    }

    @Transactional(readOnly = true)
    public Optional<CareTeamAssignment> currentAssignment(UUID patientId) {
        return assignmentRepository.findTopByPatientIdAndActiveTrueOrderByAssignedAtDesc(patientId);
    }

    @Transactional
    public void handlePriorityOverridden(QueueEntry entry, StaffUser actor) {
        appendEvent(entry.getPatient(), entry.getIntake(), actor, "PRIORITY_OVERRIDDEN", "Priority overridden",
            "%s changed %s to %s with score %d.".formatted(
                displayName(actor),
                entry.getPatient().getDisplayId(),
                entry.getUrgencyCategory(),
                entry.getUrgencyScore()
            ), "STAFF");
        refreshFlashcardsForEntry(entry, actor);
    }

    @Transactional(readOnly = true)
    public AgentDashboardResponse getDashboard(String staffLookup, String department) {
        Pageable cardPage = PageRequest.of(0, CARD_LIMIT);
        Pageable timelinePage = PageRequest.of(0, TIMELINE_LIMIT);
        StaffUser staff = resolveOptionalStaff(staffLookup);

        List<PatientFlashcard> cards = loadCards(staff, department, cardPage);
        List<UUID> patientIds = cards.stream()
            .map(card -> card.getPatient().getId())
            .distinct()
            .toList();

        List<PatientTimelineEvent> timeline = patientIds.isEmpty()
            ? loadTimelineByScope(staff, department, timelinePage)
            : timelineRepository.findByPatientIdInOrderByCreatedAtDesc(patientIds, timelinePage);

        return new AgentDashboardResponse(
            cards.stream().map(PatientFlashcardResponse::from).toList(),
            timeline.stream().map(PatientTimelineEventResponse::from).toList()
        );
    }

    @Transactional
    public PatientFlashcardResponse resolveFlashcard(UUID flashcardId, ResolveFlashcardRequest request) {
        PatientFlashcard flashcard = flashcardRepository.findById(flashcardId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Flashcard not found."));
        String resolver = request != null && StringUtils.hasText(request.staffName())
            ? request.staffName().trim()
            : "Care team";
        flashcard.resolve(resolver);
        appendEvent(
            flashcard.getPatient(),
            flashcard.getIntake(),
            null,
            "FLASHCARD_RESOLVED",
            "Flashcard resolved",
            "%s marked the %s card for %s resolved.".formatted(
                resolver,
                flashcard.getAudienceRole(),
                flashcard.getPatient().getDisplayId()
            ),
            "STAFF"
        );
        return PatientFlashcardResponse.from(flashcard);
    }

    private void refreshFlashcardsForEntry(QueueEntry entry, StaffUser actor) {
        CareTeamAssignment assignment = assignmentRepository
            .findTopByPatientIdAndActiveTrueOrderByAssignedAtDesc(entry.getPatient().getId())
            .orElseGet(() -> assignmentRepository.save(new CareTeamAssignment(
                entry.getPatient(),
                entry.getIntake(),
                resolveAssignedDoctor(entry.getIntake(), null, actor).doctor(),
                "LLM assignment refreshed after queue event."
            )));
        refreshFlashcards(entry.getPatient(), entry.getIntake(), entry, assignment, actor);
    }

    private void refreshFlashcards(Patient patient, Intake intake, QueueEntry queueEntry,
                                   CareTeamAssignment assignment, StaffUser intakeActor) {
        PatientFlashcard doctorCard = flashcardRepository
            .findTopByPatientIdAndAudienceRoleAndAssignedStaffIdOrderByUpdatedAtDesc(
                patient.getId(),
                StaffRole.DOCTOR,
                assignment.getAssignedDoctor().getId()
            )
            .orElseGet(() -> new PatientFlashcard(patient, intake, assignment.getAssignedDoctor(), StaffRole.DOCTOR));
        doctorCard.refresh(
            doctorTitle(patient, queueEntry),
            discoveryBrief(intake, queueEntry),
            doctorAction(queueEntry.getStatus()),
            queueEntry.getUrgencyCategory(),
            queueEntry.getUrgencyScore(),
            queueEntry.getStatus()
        );
        flashcardRepository.save(doctorCard);

        PatientFlashcard intakeCard = flashcardRepository
            .findTopByPatientIdAndAudienceRoleAndDepartmentIgnoreCaseOrderByUpdatedAtDesc(
                patient.getId(),
                StaffRole.INTAKE_STAFF,
                intake.getDepartment()
            )
            .orElseGet(() -> new PatientFlashcard(patient, intake, intakeActor, StaffRole.INTAKE_STAFF));
        intakeCard.refresh(
            "Agent routed " + patient.getDisplayId(),
            "Sorted to %s/%d in %s and assigned to %s.".formatted(
                queueEntry.getUrgencyCategory(),
                queueEntry.getUrgencyScore(),
                intake.getDepartment(),
                assignment.getAssignedDoctor().getDisplayName()
            ),
            intakeAction(queueEntry.getStatus()),
            queueEntry.getUrgencyCategory(),
            queueEntry.getUrgencyScore(),
            queueEntry.getStatus()
        );
        flashcardRepository.save(intakeCard);
    }

    private AssignmentDecision resolveAssignedDoctor(Intake intake, UrgencyAssessment assessment, StaffUser fallbackActor) {
        return resolveAssignedDoctor(intake, assessment, fallbackActor, null);
    }

    private AssignmentDecision resolveAssignedDoctor(Intake intake, UrgencyAssessment assessment, StaffUser fallbackActor,
                                                     String researchBriefing) {
        List<StaffUser> activeDoctors = staffUserRepository.findByRoleAndActiveTrueOrderByCreatedAtAsc(StaffRole.DOCTOR);
        return aiDoctorAssignmentService.recommend(intake, assessment, activeDoctors, researchBriefing)
            .flatMap(recommendation -> activeDoctors.stream()
                .filter(doctor -> doctor.getStaffCode().equalsIgnoreCase(recommendation.staffCode()))
                .findFirst()
                .map(doctor -> new AssignmentDecision(doctor, assignmentReason(doctor, recommendation))))
            .orElseGet(() -> fallbackAssignment(intake, activeDoctors, fallbackActor));
    }

    private AssignmentDecision fallbackAssignment(Intake intake, List<StaffUser> activeDoctors, StaffUser fallbackActor) {
        StaffUser fallbackDoctor = activeDoctors.stream()
            .filter(doctor -> sameText(doctor.getDepartment(), intake.getDepartment()))
            .findFirst()
            .or(() -> activeDoctors.stream().findFirst())
            .orElse(fallbackActor);
        if (fallbackDoctor == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No active doctor is available for assignment.");
        }
        return new AssignmentDecision(
            fallbackDoctor,
            "Fallback assignment used because the LLM doctor recommendation was unavailable."
        );
    }

    private String assignmentReason(StaffUser doctor, AiDoctorAssignmentOutput recommendation) {
        String specialty = StringUtils.hasText(doctor.getSpecialty()) ? doctor.getSpecialty() : "available specialty";
        String reason = StringUtils.hasText(recommendation.assignmentReason())
            ? recommendation.assignmentReason().trim()
            : "selected from the active doctor roster";
        return truncate("LLM Assignment Agent selected %s (%s): %s".formatted(
            doctor.getDisplayName(),
            specialty,
            reason
        ));
    }

    private boolean sameText(String first, String second) {
        return StringUtils.hasText(first) && StringUtils.hasText(second) && first.equalsIgnoreCase(second);
    }

    private String truncate(String value) {
        return value.length() <= 500 ? value : value.substring(0, 497) + "...";
    }

    private String discoveryBrief(Intake intake, QueueEntry queueEntry) {
        if (!systemAgentService.isActive("DISCOVERY_BRIEF_AGENT")) {
            return doctorSummary(intake, queueEntry);
        }
        String symptoms = intake.getStructuredSymptoms().isEmpty()
            ? "no structured symptoms"
            : String.join(", ", intake.getStructuredSymptoms());
        String risks = riskSummary(intake);
        String vitals = "Vitals: HR %s, BP %s/%s, RR %s, SpO2 %s, Temp %s C.".formatted(
            valueOrUnknown(intake.getVitals().getHeartRate()),
            valueOrUnknown(intake.getVitals().getSystolicPressure()),
            valueOrUnknown(intake.getVitals().getDiastolicPressure()),
            valueOrUnknown(intake.getVitals().getRespiratoryRate()),
            valueOrUnknown(intake.getVitals().getOxygenSaturation()),
            valueOrUnknown(intake.getVitals().getTemperatureC())
        );
        return "%s is queued as %s/%d for %s. Symptoms noted: %s. %s %s Next action: %s.".formatted(
            intake.getPatient().getDisplayId(),
            queueEntry.getUrgencyCategory(),
            queueEntry.getUrgencyScore(),
            intake.getChiefComplaint(),
            symptoms,
            risks,
            vitals,
            doctorAction(queueEntry.getStatus())
        );
    }

    private String riskSummary(Intake intake) {
        List<String> risks = new java.util.ArrayList<>();
        if (intake.getRiskFlags().isChestPain()) {
            risks.add("chest pain");
        }
        if (intake.getRiskFlags().isBreathingDifficulty()) {
            risks.add("breathing difficulty");
        }
        if (intake.getRiskFlags().isAlteredMentalState()) {
            risks.add("altered mental state");
        }
        if (intake.getRiskFlags().isSevereBleeding()) {
            risks.add("severe bleeding");
        }
        if (intake.getRiskFlags().isPregnancy()) {
            risks.add("pregnancy");
        }
        if (intake.getRiskFlags().isPediatricRisk()) {
            risks.add("pediatric risk");
        }
        if (intake.getRiskFlags().isFallOrTrauma()) {
            risks.add("fall or trauma");
        }
        if (intake.getRiskFlags().isImmunocompromised()) {
            risks.add("immunocompromised");
        }
        return risks.isEmpty() ? "No risk flags selected." : "Risk flags: " + String.join(", ", risks) + ".";
    }

    private String valueOrUnknown(Object value) {
        return value == null ? "unknown" : String.valueOf(value);
    }

    private void appendEvent(Patient patient, Intake intake, StaffUser actor, String eventType, String title,
                             String description, String source) {
        timelineRepository.save(new PatientTimelineEvent(patient, intake, actor, eventType, title, description, source));
    }

    private StaffUser resolveOptionalStaff(String staffLookup) {
        if (!StringUtils.hasText(staffLookup)) {
            return null;
        }
        return staffUserService.getByLookup(staffLookup.trim());
    }

    private List<PatientFlashcard> loadCards(StaffUser staff, String department, Pageable pageable) {
        if (staff != null && staff.getRole() == StaffRole.DOCTOR) {
            return flashcardRepository.findByAssignedStaffIdOrderByUpdatedAtDesc(staff.getId(), pageable);
        }
        if (staff != null && staff.getRole() == StaffRole.INTAKE_STAFF && StringUtils.hasText(staff.getDepartment())) {
            return flashcardRepository.findByAudienceRoleAndDepartmentIgnoreCaseOrderByUpdatedAtDesc(
                StaffRole.INTAKE_STAFF,
                staff.getDepartment(),
                pageable
            );
        }
        String scopedDepartment = staff != null && StringUtils.hasText(staff.getDepartment())
            ? staff.getDepartment()
            : department;
        if (StringUtils.hasText(scopedDepartment)) {
            return flashcardRepository.findByDepartmentIgnoreCaseOrderByUpdatedAtDesc(scopedDepartment, pageable);
        }
        return flashcardRepository.findAllByOrderByUpdatedAtDesc(pageable);
    }

    private List<PatientTimelineEvent> loadTimelineByScope(StaffUser staff, String department, Pageable pageable) {
        String scopedDepartment = staff != null && StringUtils.hasText(staff.getDepartment())
            ? staff.getDepartment()
            : department;
        if (StringUtils.hasText(scopedDepartment)) {
            return timelineRepository.findByDepartmentIgnoreCaseOrderByCreatedAtDesc(scopedDepartment, pageable);
        }
        return timelineRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    private String doctorTitle(Patient patient, QueueEntry queueEntry) {
        return "%s care card - %s".formatted(patient.getDisplayId(), queueEntry.getUrgencyCategory());
    }

    private String doctorSummary(Intake intake, QueueEntry queueEntry) {
        return "%s. Complaint: %s. Pain/distress score %d. Current status: %s.".formatted(
            queueEntry.getUrgencyCategory(),
            intake.getChiefComplaint(),
            intake.getPainLevel(),
            queueEntry.getStatus()
        );
    }

    private String doctorAction(QueueStatus status) {
        return switch (status) {
            case WAITING, IN_TRIAGE -> "Review and start treatment";
            case IN_TREATMENT -> "Continue treatment";
            case DISCHARGED -> "Review discharge record";
            case LEFT_WITHOUT_BEING_SEEN -> "Review follow-up risk";
        };
    }

    private String intakeAction(QueueStatus status) {
        return switch (status) {
            case WAITING -> "Monitor queue placement";
            case IN_TRIAGE -> "Track triage handoff";
            case IN_TREATMENT -> "Treatment started";
            case DISCHARGED -> "Closed";
            case LEFT_WITHOUT_BEING_SEEN -> "Flag departure";
        };
    }

    private String displayName(StaffUser staffUser) {
        return staffUser == null ? "CareFlow Agent" : staffUser.getDisplayName();
    }

    private record AssignmentDecision(StaffUser doctor, String reason) {
    }
}
