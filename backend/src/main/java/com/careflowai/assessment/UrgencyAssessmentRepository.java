package com.careflowai.assessment;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UrgencyAssessmentRepository extends JpaRepository<UrgencyAssessment, UUID> {
    Optional<UrgencyAssessment> findTopByPatientIdOrderByAssessedAtDesc(UUID patientId);

    java.util.List<UrgencyAssessment> findTop200ByOrderByAssessedAtDesc();
}
