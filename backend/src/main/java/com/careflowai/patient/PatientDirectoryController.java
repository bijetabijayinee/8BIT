package com.careflowai.patient;

import com.careflowai.patient.dto.PatientDirectoryEntryResponse;
import com.careflowai.patient.dto.PatientStoryResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/patients")
public class PatientDirectoryController {

    private final PatientDirectoryService patientDirectoryService;

    public PatientDirectoryController(PatientDirectoryService patientDirectoryService) {
        this.patientDirectoryService = patientDirectoryService;
    }

    @GetMapping("/directory")
    public List<PatientDirectoryEntryResponse> directory(@RequestParam(required = false) String query) {
        return patientDirectoryService.directory(query);
    }

    @GetMapping("/{patientId}/story")
    public PatientStoryResponse story(@PathVariable UUID patientId) {
        return patientDirectoryService.story(patientId);
    }
}
