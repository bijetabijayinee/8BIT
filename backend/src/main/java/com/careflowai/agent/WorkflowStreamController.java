package com.careflowai.agent;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/agent/workflow")
public class WorkflowStreamController {

    private final WorkflowStreamService workflowStreamService;

    public WorkflowStreamController(WorkflowStreamService workflowStreamService) {
        this.workflowStreamService = workflowStreamService;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return workflowStreamService.subscribe();
    }
}
