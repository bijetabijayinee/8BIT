package com.careflowai.assessment;

import com.careflowai.common.ConfidenceLevel;
import com.careflowai.common.UrgencyCategory;
import com.careflowai.intake.Intake;
import com.careflowai.patient.Patient;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
public class UrgencyAssessment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    private Patient patient;

    @ManyToOne(optional = false)
    private Intake intake;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UrgencyCategory finalCategory;

    @Column(nullable = false)
    private int finalScore;

    @ElementCollection
    @CollectionTable(name = "urgency_score_factors", joinColumns = @JoinColumn(name = "assessment_id"))
    @Column(name = "factor", nullable = false, columnDefinition = "text")
    private List<String> scoreFactors = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    private UrgencyCategory suggestedCategory;

    private Integer suggestedScore;

    @ElementCollection
    @CollectionTable(name = "urgency_red_flags", joinColumns = @JoinColumn(name = "assessment_id"))
    @Column(name = "red_flag", nullable = false, columnDefinition = "text")
    private List<String> redFlagIndicators = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "urgency_missing_details", joinColumns = @JoinColumn(name = "assessment_id"))
    @Column(name = "missing_detail", nullable = false, columnDefinition = "text")
    private List<String> missingOrAmbiguousDetails = new ArrayList<>();

    @Column(columnDefinition = "text")
    private String structuredSymptomSummary;

    @Column(columnDefinition = "text")
    private String suggestedDiagnosis;

    @Column(columnDefinition = "text")
    private String medicalAttentionNote;

    @Column(columnDefinition = "text")
    private String staffFacingExplanation;

    @Enumerated(EnumType.STRING)
    private ConfidenceLevel confidenceLevel;

    @Column(nullable = false)
    private Instant assessedAt;

    protected UrgencyAssessment() {
    }

    public UrgencyAssessment(Patient patient, Intake intake, UrgencyCategory finalCategory, int finalScore) {
        this.patient = patient;
        this.intake = intake;
        this.finalCategory = finalCategory;
        this.finalScore = finalScore;
    }

    public void replaceScoreFactors(List<String> scoreFactors) {
        this.scoreFactors.clear();
        if (scoreFactors != null) {
            this.scoreFactors.addAll(scoreFactors);
        }
    }

    public void attachAdvisoryOutput(String suggestedDiagnosis, UrgencyCategory suggestedCategory, Integer suggestedScore,
                                     List<String> redFlagIndicators, List<String> missingOrAmbiguousDetails,
                                     String structuredSymptomSummary, String medicalAttentionNote, String staffFacingExplanation,
                                     ConfidenceLevel confidenceLevel) {
        this.suggestedDiagnosis = suggestedDiagnosis;
        this.suggestedCategory = suggestedCategory;
        this.suggestedScore = suggestedScore;
        this.redFlagIndicators.clear();
        if (redFlagIndicators != null) {
            this.redFlagIndicators.addAll(redFlagIndicators);
        }
        this.missingOrAmbiguousDetails.clear();
        if (missingOrAmbiguousDetails != null) {
            this.missingOrAmbiguousDetails.addAll(missingOrAmbiguousDetails);
        }
        this.structuredSymptomSummary = structuredSymptomSummary;
        this.medicalAttentionNote = medicalAttentionNote;
        this.staffFacingExplanation = staffFacingExplanation;
        this.confidenceLevel = confidenceLevel;
    }

    @PrePersist
    void onCreate() {
        if (assessedAt == null) {
            assessedAt = Instant.now();
        }
    }

    public UUID getId() {
        return id;
    }

    public Patient getPatient() {
        return patient;
    }

    public Intake getIntake() {
        return intake;
    }

    public UrgencyCategory getFinalCategory() {
        return finalCategory;
    }

    public int getFinalScore() {
        return finalScore;
    }

    public List<String> getScoreFactors() {
        return scoreFactors;
    }

    public UrgencyCategory getSuggestedCategory() {
        return suggestedCategory;
    }

    public Integer getSuggestedScore() {
        return suggestedScore;
    }

    public List<String> getRedFlagIndicators() {
        return redFlagIndicators;
    }

    public List<String> getMissingOrAmbiguousDetails() {
        return missingOrAmbiguousDetails;
    }

    public String getStructuredSymptomSummary() {
        return structuredSymptomSummary;
    }

    public String getSuggestedDiagnosis() {
        return suggestedDiagnosis;
    }

    public String getMedicalAttentionNote() {
        return medicalAttentionNote;
    }

    public String getStaffFacingExplanation() {
        return staffFacingExplanation;
    }

    public ConfidenceLevel getConfidenceLevel() {
        return confidenceLevel;
    }

    public Instant getAssessedAt() {
        return assessedAt;
    }
}
