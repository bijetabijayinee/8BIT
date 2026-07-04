package com.careflowai.agent;

import com.careflowai.agent.dto.AgentDashboardResponse;
import com.careflowai.agent.dto.AgentPerformanceResponse;
import com.careflowai.agent.dto.PatientFlashcardResponse;
import com.careflowai.agent.dto.ResolveFlashcardRequest;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/agent")
public class PatientAgentController {

    private final PatientAgentService patientAgentService;
    private final AgentPerformanceService agentPerformanceService;

    public PatientAgentController(PatientAgentService patientAgentService,
                                  AgentPerformanceService agentPerformanceService) {
        this.patientAgentService = patientAgentService;
        this.agentPerformanceService = agentPerformanceService;
    }

    @GetMapping("/performance")
    public AgentPerformanceResponse performance() {
        return agentPerformanceService.performance();
    }

    @GetMapping("/dashboard")
    public AgentDashboardResponse dashboard(@RequestParam(required = false) String staffLookup,
                                            @RequestParam(required = false) String department) {
        return patientAgentService.getDashboard(staffLookup, department);
    }

    @PostMapping("/flashcards/{flashcardId}/resolve")
    public PatientFlashcardResponse resolveFlashcard(@PathVariable UUID flashcardId,
                                                     @RequestBody ResolveFlashcardRequest request) {
        return patientAgentService.resolveFlashcard(flashcardId, request);
    }
}
