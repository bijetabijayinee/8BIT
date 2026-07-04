package com.careflowai.agent;

import com.careflowai.ai.SpringAiChatService;
import com.careflowai.intake.Intake;
import com.careflowai.patient.Patient;
import com.careflowai.thread.PatientThreadAttachment;
import com.careflowai.thread.PatientThreadComment;
import com.careflowai.thread.PatientThreadCommentRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

/**
 * Medical expert agent that runs INSIDE the intake workflow, before queue sorting and
 * doctor assignment, so its findings feed the later stages:
 *   1. builds candidate search queries from the triage LLM's suggested diagnosis,
 *      the chief complaint, and the structured symptoms,
 *   2. calls its online tool (Wikipedia REST API) trying each query until articles are found,
 *   3. asks the LLM to reason over the articles against the patient's presentation,
 *   4. saves the briefing + citation links to the patient thread and timeline,
 *   5. returns the briefing so the Assignment Agent can use it when choosing a doctor.
 */
@Component
public class MedicalResearchAgent {

    private static final Logger log = LoggerFactory.getLogger(MedicalResearchAgent.class);
    private static final String AGENT_NAME = "Medical Research Agent";
    private static final String AGENT_CODE = "RESEARCH_AGENT";
    private static final int MAX_ARTICLES = 3;
    private static final Set<String> QUALIFIER_WORDS = Set.of(
        "possible", "suspected", "likely", "probable", "acute", "rule", "out", "r/o", "vs", "versus");

    private static final String SUMMARY_INSTRUCTION = """
        You are a medical research assistant supporting hospital triage staff (not the patient).
        Given a patient's presentation and excerpts from public medical reference articles,
        write a concise educational briefing.
        Format: 3-5 lines, each starting with "- ". Cover what the condition typically involves,
        warning signs staff should watch for, and assessment considerations. Keep numbers explicit.
        Start any truly time-critical line with "WARNING:".
        Do NOT prescribe medication, dosages, or a treatment plan. No definitive diagnosis.
        """;

    private final PatientTimelineEventRepository timelineRepository;
    private final PatientThreadCommentRepository threadCommentRepository;
    private final SystemAgentService systemAgentService;
    private final WorkflowStreamService workflowStream;
    private final SpringAiChatService springAiChatService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public MedicalResearchAgent(PatientTimelineEventRepository timelineRepository,
                                PatientThreadCommentRepository threadCommentRepository,
                                SystemAgentService systemAgentService,
                                WorkflowStreamService workflowStream,
                                SpringAiChatService springAiChatService,
                                ObjectMapper objectMapper) {
        this.timelineRepository = timelineRepository;
        this.threadCommentRepository = threadCommentRepository;
        this.systemAgentService = systemAgentService;
        this.workflowStream = workflowStream;
        this.springAiChatService = springAiChatService;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5_000);
        requestFactory.setReadTimeout(8_000);
        this.restClient = RestClient.builder()
            .requestFactory(requestFactory)
            .defaultHeader("User-Agent", "CareFlowAI/0.1 (hospital operations demo; contact: careflow@example.com)")
            .defaultHeader("Accept", "application/json")
            .build();
    }

    public record Citation(String title, String url) {
    }

    public record ResearchOutcome(String briefing, List<Citation> citations) {
    }

    /**
     * Runs the full research flow synchronously. Never throws: on any failure it reports
     * the reason to the workflow stream and returns empty so the intake continues.
     */
    public Optional<ResearchOutcome> research(Patient patient, Intake intake, String suggestedDiagnosis) {
        String displayId = patient.getDisplayId();
        if (!systemAgentService.isActive(AGENT_CODE)) {
            workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "Research skipped",
                "Medical Research Agent is inactive in the System Agents panel.", null);
            return Optional.empty();
        }

        List<String> queries = candidateQueries(suggestedDiagnosis, intake);
        workflowStream.publish(displayId, "RESEARCH_STARTED", AGENT_NAME, "Searching medical articles",
            "Searching online medical references. Query plan: " + String.join(" -> ", queries) + ".",
            researchStartReasoning(suggestedDiagnosis, queries));

        try {
            List<Article> articles = List.of();
            String usedQuery = null;
            for (String query : queries) {
                articles = searchArticles(query);
                log.info("Research query '{}' for {} returned {} articles", query, displayId, articles.size());
                if (!articles.isEmpty()) {
                    usedQuery = query;
                    break;
                }
            }
            if (articles.isEmpty()) {
                workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "No articles found",
                    "No online reference matched any query (" + String.join(", ", queries) + ").",
                    "The online medical reference returned no usable match for any of the tried queries. "
                        + "Staff should rely on the triage assessment. Check backend logs ('Research query') "
                        + "to confirm the searches actually reached the internet.");
                return Optional.empty();
            }

            workflowStream.publish(displayId, "RESEARCH_SOURCES", AGENT_NAME, "Articles found",
                "Query \"%s\" matched %d articles.".formatted(usedQuery, articles.size()),
                articlesReasoning(usedQuery, articles));

            String briefing = summarize(intake, suggestedDiagnosis, articles);
            saveResearch(patient, intake, articles, briefing);
            List<Citation> citations = articles.stream()
                .map(article -> new Citation(article.title(), article.url()))
                .toList();

            workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "Research saved to patient record",
                "Briefing and %d citations saved to %s's thread. Findings now feed queue sorting and doctor assignment.".formatted(
                    citations.size(), displayId),
                savedReasoning(briefing, citations));
            return Optional.of(new ResearchOutcome(briefing, citations));
        } catch (Exception failure) {
            log.warn("Medical research failed for {}: {}", displayId, failure.toString());
            workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "Research unavailable",
                "Online article search failed (" + shorten(failure.getMessage(), 120) + "). Workflow continues without it.",
                "The agent could not reach the online medical reference (network error or timeout). "
                    + "The remaining agents still run; research can be retried on the next intake.");
            return Optional.empty();
        }
    }

    private List<String> candidateQueries(String suggestedDiagnosis, Intake intake) {
        Set<String> queries = new LinkedHashSet<>();
        String cleanedDiagnosis = cleanDiagnosis(suggestedDiagnosis);
        if (StringUtils.hasText(cleanedDiagnosis)) {
            queries.add(cleanedDiagnosis);
        }
        if (StringUtils.hasText(intake.getChiefComplaint())) {
            queries.add(intake.getChiefComplaint().trim());
        }
        if (intake.getStructuredSymptoms() != null && !intake.getStructuredSymptoms().isEmpty()) {
            queries.add(String.join(" ", intake.getStructuredSymptoms()
                .subList(0, Math.min(2, intake.getStructuredSymptoms().size()))));
        }
        return queries.stream().filter(StringUtils::hasText).limit(3).toList();
    }

    /** "Possible acute coronary syndrome (unstable angina) vs GERD" -> "coronary syndrome". */
    private String cleanDiagnosis(String diagnosis) {
        if (!StringUtils.hasText(diagnosis)) {
            return null;
        }
        String cleaned = diagnosis
            .replaceAll("\\([^)]*\\)", " ")
            .split("[,;/]|\\bor\\b|\\bvs\\b|\\bversus\\b")[0];
        String filtered = java.util.Arrays.stream(cleaned.trim().split("\\s+"))
            .filter(word -> !QUALIFIER_WORDS.contains(word.toLowerCase(Locale.ROOT)))
            .reduce((a, b) -> a + " " + b)
            .orElse("");
        return shorten(filtered, 70);
    }

    private String researchStartReasoning(String suggestedDiagnosis, List<String> queries) {
        StringBuilder reasoning = new StringBuilder("The Medical Research Agent acts as the team's medical expert.\n");
        reasoning.append("- Basis: ").append(StringUtils.hasText(suggestedDiagnosis)
            ? "triage LLM's suggested concern \"" + suggestedDiagnosis + "\""
            : "the recorded complaint and symptoms").append("\n");
        reasoning.append("- Tool: Wikipedia medical reference REST API (live internet search)\n");
        reasoning.append("- Query plan (tried in order until articles are found):\n");
        queries.forEach(query -> reasoning.append("  - \"").append(query).append("\"\n"));
        reasoning.append("- Its findings are saved to the record and handed to the Priority and Assignment agents.");
        return reasoning.toString();
    }

    private String articlesReasoning(String usedQuery, List<Article> articles) {
        StringBuilder reasoning = new StringBuilder("Query \"" + usedQuery + "\" returned these reference articles:\n");
        articles.forEach(article -> reasoning.append("- ").append(article.title())
            .append(" - ").append(shorten(article.summary(), 180))
            .append(" ").append(article.url()).append("\n"));
        reasoning.append("The agent now reasons over these against the patient's presentation.");
        return reasoning.toString();
    }

    private String savedReasoning(String briefing, List<Citation> citations) {
        StringBuilder reasoning = new StringBuilder("Briefing written from the articles:\n");
        reasoning.append(briefing).append("\n\nCitations attached to the patient record:\n");
        citations.forEach(citation -> reasoning.append("- ").append(citation.title())
            .append(" ").append(citation.url()).append("\n"));
        return reasoning.toString();
    }

    private List<Article> searchArticles(String query) {
        String url = "https://en.wikipedia.org/w/rest.php/v1/search/page?q=%s&limit=%d"
            .formatted(URLEncoder.encode(query, StandardCharsets.UTF_8), MAX_ARTICLES);
        String body = restClient.get().uri(url).retrieve().body(String.class);
        List<Article> articles = new ArrayList<>();
        try {
            JsonNode pages = objectMapper.readTree(body).path("pages");
            for (JsonNode page : pages) {
                String key = page.path("key").asText("");
                String title = page.path("title").asText("");
                if (key.isBlank() || title.isBlank()) {
                    continue;
                }
                String summary = fetchSummary(key);
                if (!StringUtils.hasText(summary)) {
                    summary = page.path("description").asText("No summary available.");
                }
                articles.add(new Article(title, "https://en.wikipedia.org/wiki/" + key, summary));
            }
        } catch (Exception parseFailure) {
            log.warn("Could not parse article search response for '{}': {}", query, parseFailure.getMessage());
        }
        return articles;
    }

    private String fetchSummary(String pageKey) {
        try {
            String body = restClient.get()
                .uri("https://en.wikipedia.org/api/rest_v1/page/summary/" + pageKey)
                .retrieve()
                .body(String.class);
            return objectMapper.readTree(body).path("extract").asText("");
        } catch (Exception summaryFailure) {
            return "";
        }
    }

    private String summarize(Intake intake, String suggestedDiagnosis, List<Article> articles) {
        try {
            StringBuilder userInput = new StringBuilder();
            userInput.append("Patient presentation: ").append(intake.getChiefComplaint());
            if (intake.getStructuredSymptoms() != null && !intake.getStructuredSymptoms().isEmpty()) {
                userInput.append(" | symptoms: ").append(String.join(", ", intake.getStructuredSymptoms()));
            }
            if (StringUtils.hasText(suggestedDiagnosis)) {
                userInput.append(" | triage concern: ").append(suggestedDiagnosis);
            }
            userInput.append("\n\nReference article excerpts:\n");
            articles.forEach(article -> userInput.append("- ").append(article.title()).append(": ")
                .append(shorten(article.summary(), 500)).append("\n"));
            String summary = springAiChatService.respond(SUMMARY_INSTRUCTION, userInput.toString());
            if (StringUtils.hasText(summary)) {
                return summary.trim();
            }
        } catch (Exception summaryFailure) {
            log.warn("Research LLM summary failed, using raw article extracts: {}", summaryFailure.getMessage());
        }
        return articles.stream()
            .map(article -> "- " + article.title() + ": " + shorten(article.summary(), 300))
            .reduce((a, b) -> a + "\n" + b)
            .orElse("No briefing available.");
    }

    private void saveResearch(Patient patient, Intake intake, List<Article> articles, String briefing) {
        StringBuilder note = new StringBuilder("Medical research briefing for ")
            .append(intake.getChiefComplaint())
            .append(" (automated online research):\n\n")
            .append(briefing)
            .append("\n\nSources:");
        articles.forEach(article -> note.append("\n- ").append(article.title()).append(" (").append(article.url()).append(")"));

        PatientThreadComment comment = new PatientThreadComment(patient, intake, AGENT_NAME, note.toString());
        articles.forEach(article -> comment.addAttachment(new PatientThreadAttachment(
            article.title(),
            "text/html",
            article.url()
        )));
        threadCommentRepository.save(comment);

        timelineRepository.save(new PatientTimelineEvent(
            patient,
            intake,
            null,
            "MEDICAL_RESEARCH",
            "Medical research saved",
            shorten("%s researched \"%s\", wrote a briefing, and attached %d source links to the patient thread.".formatted(
                AGENT_NAME, intake.getChiefComplaint(), articles.size()), 990),
            "AGENT"
        ));
    }

    private String shorten(String value, int maxLength) {
        if (value == null) {
            return "";
        }
        String compact = value.replaceAll("\\s+", " ").trim();
        return compact.length() <= maxLength ? compact : compact.substring(0, maxLength - 3) + "...";
    }

    private record Article(String title, String url, String summary) {
    }
}
