package com.careflowai.intake;

import com.careflowai.agent.MedicalResearchAgent;
import com.careflowai.agent.PatientAgentService;
import com.careflowai.agent.WorkflowStreamService;
import com.careflowai.ai.AiAssessmentOutput;
import com.careflowai.ai.AiAssessmentService;
import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.assessment.UrgencyAssessmentRepository;
import com.careflowai.assessment.dto.UrgencyAssessmentResponse;
import com.careflowai.common.QueueStatus;
import com.careflowai.intake.dto.CreateIntakeRequest;
import com.careflowai.intake.dto.IntakeResponse;
import com.careflowai.patient.Patient;
import com.careflowai.patient.PatientRepository;
import com.careflowai.queue.QueueEntry;
import com.careflowai.queue.QueueService;
import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserService;
import com.careflowai.vector.SimpleIntakeVectorStore;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class IntakeService {

    private final PatientRepository patientRepository;
    private final IntakeRepository intakeRepository;
    private final UrgencyAssessmentRepository assessmentRepository;
    private final AiAssessmentService aiAssessmentService;
    private final QueueService queueService;
    private final PatientAgentService patientAgentService;
    private final StaffUserService staffUserService;
    private final IntakeMapper intakeMapper;
    private final SimpleIntakeVectorStore vectorStore;
    private final WorkflowStreamService workflowStream;
    private final MedicalResearchAgent medicalResearchAgent;

    public IntakeService(PatientRepository patientRepository,
                         IntakeRepository intakeRepository,
                         UrgencyAssessmentRepository assessmentRepository,
                         AiAssessmentService aiAssessmentService,
                         QueueService queueService,
                         PatientAgentService patientAgentService,
                         StaffUserService staffUserService,
                         IntakeMapper intakeMapper,
                         SimpleIntakeVectorStore vectorStore,
                         WorkflowStreamService workflowStream,
                         MedicalResearchAgent medicalResearchAgent) {
        this.patientRepository = patientRepository;
        this.intakeRepository = intakeRepository;
        this.assessmentRepository = assessmentRepository;
        this.aiAssessmentService = aiAssessmentService;
        this.queueService = queueService;
        this.patientAgentService = patientAgentService;
        this.staffUserService = staffUserService;
        this.intakeMapper = intakeMapper;
        this.vectorStore = vectorStore;
        this.workflowStream = workflowStream;
        this.medicalResearchAgent = medicalResearchAgent;
    }

    @Transactional
    public IntakeResponse create(CreateIntakeRequest request) {
        String patientDisplayId = resolvePatientDisplayId(request.patientDisplayId());
        patientRepository.findByDisplayId(patientDisplayId).ifPresent(existing -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Patient display ID already exists.");
        });

        workflowStream.publish(patientDisplayId, "INTAKE_RECEIVED", "Intake workspace", "Intake received",
            "Registering arrival for %s: %s.".formatted(patientDisplayId, request.chiefComplaint()));

        StaffUser actor = staffUserService.resolveActor(request.staffName(), null, request.department());
        Patient patient = patientRepository.save(new Patient(patientDisplayId, request.ageBand()));
        String contactMetadata = contactMetadata(request);
        if (contactMetadata != null) {
            patient.updateContactMetadata(contactMetadata);
        }
        Intake intake = intakeRepository.save(toIntake(patient, request, actor));
        workflowStream.publish(patientDisplayId, "INTAKE_SAVED", "Intake workspace", "Saved to database",
            "Patient record and intake stored in Postgres (department %s).".formatted(intake.getDepartment()));

        UrgencyAssessment assessment = createAssessment(patient, intake);

        // The Medical Research Agent runs before queue sorting and assignment so its
        // findings feed the later stages (and never break the intake if it fails).
        String researchBriefing = medicalResearchAgent
            .research(patient, intake, assessment.getSuggestedDiagnosis())
            .map(MedicalResearchAgent.ResearchOutcome::briefing)
            .orElse(null);

        QueueEntry queueEntry = queueService.upsertFromAssessment(patient, intake, assessment);
        workflowStream.publish(patientDisplayId, "QUEUE_SORTED", "Priority Agent", "Patient sorted into queue",
            "Placed as %s with urgency score %d in %s.".formatted(
                queueEntry.getUrgencyCategory(), queueEntry.getUrgencyScore(), queueEntry.getDepartment()),
            queueSortReasoning(assessment, queueEntry));

        patientAgentService.handleIntakeIngested(patient, intake, assessment, queueEntry, actor, researchBriefing);
        vectorStore.indexQueueEntry(queueEntry, assessment, assignmentSummary(patient));
        workflowStream.publish(patientDisplayId, "CONTEXT_INDEXED", "Savi memory", "Context indexed",
            "Intake, triage, and research context embedded into Savi's semantic memory.");
        workflowStream.publish(patientDisplayId, "WORKFLOW_COMPLETE", "All agents", "Workflow complete",
            "All agents finished for %s.".formatted(patientDisplayId), null);
        return IntakeResponse.from(intake, UrgencyAssessmentResponse.from(assessment));
    }

    @Transactional(readOnly = true)
    public String nextPatientDisplayId() {
        return generatePatientDisplayId();
    }

    @Transactional(readOnly = true)
    public IntakeResponse get(UUID intakeId) {
        Intake intake = intakeRepository.findById(intakeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Intake not found."));
        UrgencyAssessment assessment = assessmentRepository.findTopByPatientIdOrderByAssessedAtDesc(intake.getPatient().getId())
            .orElse(null);
        return IntakeResponse.from(intake, assessment == null ? null : UrgencyAssessmentResponse.from(assessment));
    }

    @Transactional
    public IntakeResponse assess(UUID intakeId) {
        Intake intake = intakeRepository.findById(intakeId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Intake not found."));
        UrgencyAssessment assessment = createAssessment(intake.getPatient(), intake);
        QueueEntry queueEntry = queueService.upsertFromAssessment(intake.getPatient(), intake, assessment);
        vectorStore.indexQueueEntry(queueEntry, assessment, assignmentSummary(intake.getPatient()));
        return IntakeResponse.from(intake, UrgencyAssessmentResponse.from(assessment));
    }

    private Intake toIntake(Patient patient, CreateIntakeRequest request, StaffUser actor) {
        return new Intake(
            patient,
            request.arrivalTimestamp() == null ? Instant.now() : request.arrivalTimestamp(),
            request.arrivalMode(),
            request.chiefComplaint(),
            request.symptomNotes(),
            cleanSymptoms(request.structuredSymptoms()),
            request.painLevel(),
            intakeMapper.toVitals(request.vitals()),
            intakeMapper.toRiskFlags(request.riskFlags()),
            request.department(),
            request.currentStatus() == null ? QueueStatus.WAITING : request.currentStatus(),
            staffAttribution(actor)
        );
    }

    private String contactMetadata(CreateIntakeRequest request) {
        List<String> parts = new java.util.ArrayList<>();
        if (request.patientName() != null && !request.patientName().isBlank()) {
            parts.add("Name: " + request.patientName().trim());
        }
        if (request.gender() != null && !request.gender().isBlank()) {
            parts.add("Gender: " + request.gender().trim());
        }
        if (request.contactPhone() != null && !request.contactPhone().isBlank()) {
            parts.add("Phone: " + request.contactPhone().trim());
        }
        return parts.isEmpty() ? null : String.join(" | ", parts);
    }

    private String resolvePatientDisplayId(String requestedDisplayId) {
        if (requestedDisplayId != null && !requestedDisplayId.isBlank()) {
            return requestedDisplayId.trim().toUpperCase();
        }
        return generatePatientDisplayId();
    }

    private String generatePatientDisplayId() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        String prefix = "CF-" + datePart + "-";
        long nextNumber = patientRepository.countByDisplayIdStartingWith(prefix) + 1;
        String candidate;
        do {
            candidate = prefix + String.format("%04d", nextNumber++);
        } while (patientRepository.findByDisplayId(candidate).isPresent());
        return candidate;
    }

    private String staffAttribution(StaffUser actor) {
        if (actor == null) {
            return "Auto-filled by CareFlow intake workspace.";
        }
        return "Auto-filled from logged-in staff: %s (%s, %s).".formatted(
            actor.getDisplayName(),
            actor.getStaffCode(),
            actor.getRole()
        );
    }

    private UrgencyAssessment createAssessment(Patient patient, Intake intake) {
        workflowStream.publish(patient.getDisplayId(), "LLM_REQUESTED", "Savi LLM triage", "LLM triage called",
            "Sending intake to the LLM for urgency, diagnosis, and attention notes.");
        AiAssessmentOutput advisory = aiAssessmentService.assess(intake);
        if (advisory.suggestedCategory() == null || advisory.suggestedScore() == null) {
            workflowStream.publish(patient.getDisplayId(), "LLM_RESPONDED", "Savi LLM triage", "LLM triage failed",
                "The LLM response did not include a usable urgency category and score.");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                "LLM triage response did not include a usable urgency category and score.");
        }
        workflowStream.publish(patient.getDisplayId(), "LLM_RESPONDED", "Savi LLM triage", "LLM response received",
            "Suggested %s (%d): %s".formatted(
                advisory.suggestedCategory(),
                advisory.suggestedScore(),
                advisory.suggestedDiagnosis() == null ? "no diagnosis text" : advisory.suggestedDiagnosis()),
            llmReasoning(advisory));
        int finalScore = Math.max(0, Math.min(100, advisory.suggestedScore()));
        UrgencyAssessment assessment = new UrgencyAssessment(patient, intake, advisory.suggestedCategory(), finalScore);
        assessment.replaceScoreFactors(scoreFactors(advisory));
        assessment.attachAdvisoryOutput(
            advisory.suggestedDiagnosis(),
            advisory.suggestedCategory(),
            advisory.suggestedScore(),
            advisory.redFlagIndicators(),
            advisory.missingOrAmbiguousDetails(),
            advisory.structuredSymptomSummary(),
            advisory.medicalAttentionNote(),
            advisory.staffFacingExplanation(),
            advisory.confidenceLevel()
        );
        return assessmentRepository.save(assessment);
    }

    private String llmReasoning(AiAssessmentOutput advisory) {
        StringBuilder reasoning = new StringBuilder();
        reasoning.append("The triage LLM read the chief complaint, structured symptoms, vitals, distress score, and risk flags, then reasoned about how dangerous the presentation is.\n\n");
        if (advisory.structuredSymptomSummary() != null && !advisory.structuredSymptomSummary().isBlank()) {
            reasoning.append("What it understood: ").append(advisory.structuredSymptomSummary()).append("\n\n");
        }
        reasoning.append("Chosen urgency: ").append(advisory.suggestedCategory())
            .append(" with severity score ").append(advisory.suggestedScore()).append("/100.\n");
        if (advisory.suggestedDiagnosis() != null && !advisory.suggestedDiagnosis().isBlank()) {
            reasoning.append("Likely concern / differential: ").append(advisory.suggestedDiagnosis()).append("\n");
        }
        if (advisory.redFlagIndicators() != null && !advisory.redFlagIndicators().isEmpty()) {
            reasoning.append("Red flags that pushed the score up: ").append(String.join(", ", advisory.redFlagIndicators())).append("\n");
        }
        if (advisory.missingOrAmbiguousDetails() != null && !advisory.missingOrAmbiguousDetails().isEmpty()) {
            reasoning.append("Uncertainty / missing details it flagged: ").append(String.join(", ", advisory.missingOrAmbiguousDetails())).append("\n");
        }
        if (advisory.staffFacingExplanation() != null && !advisory.staffFacingExplanation().isBlank()) {
            reasoning.append("\nExplanation for staff: ").append(advisory.staffFacingExplanation()).append("\n");
        }
        reasoning.append("\nConfidence in this assessment: ").append(advisory.confidenceLevel()).append(".");
        return reasoning.toString();
    }

    private String queueSortReasoning(UrgencyAssessment assessment, QueueEntry queueEntry) {
        return ("""
            The Priority Agent took the LLM's urgency of %s (score %d) and placed the patient in the live queue for %s.

            Queue ordering rule it applied: patients are ranked first by urgency category (Critical > High > Medium > Low), then staff escalations, then by how long they have been waiting (patients near 30 minutes and past 40 minutes are pushed up), and finally by severity score.

            Because this patient is %s, they enter the %s band and will be re-ranked automatically as their wait grows.""")
            .formatted(
                assessment.getFinalCategory(),
                assessment.getFinalScore(),
                queueEntry.getDepartment(),
                assessment.getFinalCategory(),
                assessment.getFinalCategory()
            );
    }

    private List<String> scoreFactors(AiAssessmentOutput advisory) {
        List<String> factors = new java.util.ArrayList<>();
        factors.add("LLM triage assessment selected the final urgency category and score.");
        if (!advisory.redFlagIndicators().isEmpty()) {
            factors.add("LLM red flags: " + String.join(", ", advisory.redFlagIndicators()));
        }
        if (advisory.suggestedDiagnosis() != null && !advisory.suggestedDiagnosis().isBlank()) {
            factors.add("LLM suggested diagnosis: " + advisory.suggestedDiagnosis());
        }
        if (advisory.medicalAttentionNote() != null && !advisory.medicalAttentionNote().isBlank()) {
            factors.add("Medical attention note: " + advisory.medicalAttentionNote());
        }
        if (advisory.staffFacingExplanation() != null && !advisory.staffFacingExplanation().isBlank()) {
            factors.add(advisory.staffFacingExplanation());
        }
        return factors;
    }

    private List<String> cleanSymptoms(List<String> symptoms) {
        if (symptoms == null) {
            return List.of();
        }
        return symptoms.stream()
            .filter(symptom -> symptom != null && !symptom.isBlank())
            .map(String::trim)
            .toList();
    }

    private String assignmentSummary(Patient patient) {
        return patientAgentService.currentAssignment(patient.getId())
            .map(assignment -> "Active doctor assignment: %s (%s). Reason: %s.".formatted(
                assignment.getAssignedDoctor().getDisplayName(),
                assignment.getAssignedDoctor().getStaffCode(),
                assignment.getAssignmentReason()
            ))
            .orElse(null);
    }
}
