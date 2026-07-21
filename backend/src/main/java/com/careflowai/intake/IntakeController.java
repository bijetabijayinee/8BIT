package com.careflowai.intake;

import com.careflowai.intake.dto.CreateIntakeRequest;
import com.careflowai.intake.dto.IntakeResponse;
import com.careflowai.intake.dto.PatientReportResponse;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intakes")
public class IntakeController {

    private final IntakeService intakeService;
    private final PatientReportService patientReportService;

    public IntakeController(IntakeService intakeService, PatientReportService patientReportService) {
        this.intakeService = intakeService;
        this.patientReportService = patientReportService;
    }

    @PostMapping
    public IntakeResponse create(@Valid @RequestBody CreateIntakeRequest request) {
        return intakeService.create(request);
    }

    @GetMapping("/next-patient-display-id")
    public Map<String, String> nextPatientDisplayId(@RequestParam(required = false) String department) {
        return Map.of("patientDisplayId", intakeService.nextPatientDisplayId(department));
    }

    @GetMapping("/{id}")
    public IntakeResponse get(@PathVariable UUID id) {
        return intakeService.get(id);
    }

    @PostMapping("/{id}/assess")
    public IntakeResponse assess(@PathVariable UUID id) {
        return intakeService.assess(id);
    }

    @PostMapping("/{id}/report")
    public PatientReportResponse report(@PathVariable UUID id) {
        return patientReportService.generate(id);
    }
}
