package com.careflowai.analytics;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class ResultsAnalyticsController {

    private final ResultsAnalyticsService resultsAnalyticsService;

    public ResultsAnalyticsController(ResultsAnalyticsService resultsAnalyticsService) {
        this.resultsAnalyticsService = resultsAnalyticsService;
    }

    @GetMapping("/results")
    public ResultsAnalyticsResponse results() {
        return resultsAnalyticsService.results();
    }
}
