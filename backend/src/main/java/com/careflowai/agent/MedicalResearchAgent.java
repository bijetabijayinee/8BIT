package com.careflowai.agent;

import com.careflowai.ai.OpenAiResponsesClient;
import com.careflowai.ai.OpenAiResponsesClient.WebCitation;
import com.careflowai.ai.OpenAiResponsesClient.WebSearchOutcome;
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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
 *   1. builds candidate search terms from the triage LLM's suggested diagnosis, the chief
 *      complaint, and the structured symptoms,
 *   2. gathers PubMed (NCBI E-utilities) peer-reviewed grounding for the presentation,
 *   3. hands that grounding to an LLM call armed with OpenAI's live web_search tool, which
 *      itself decides what to search - current medical guidance, and recent local news for
 *      the hospital's city - reasoning over real, different results every time,
 *   4. saves the reasoned briefing + every real citation the model actually used to the
 *      patient thread and timeline (never a fixed link set),
 *   5. returns the briefing so the Assignment Agent can use it when choosing a doctor.
 *
 * A human always reviews the saved briefing before it drives any action - the agent writes
 * research notes, it does not prescribe or decide treatment.
 */
@Component
public class MedicalResearchAgent {

    private static final Logger log = LoggerFactory.getLogger(MedicalResearchAgent.class);
    private static final String AGENT_NAME = "Medical Research Agent";
    private static final String AGENT_CODE = "RESEARCH_AGENT";
    private static final int MAX_PUBMED_ARTICLES = 4;
    private static final int MAX_CITATIONS_SAVED = 12;
    private static final Set<String> QUALIFIER_WORDS = Set.of(
        "possible", "suspected", "likely", "probable", "acute", "rule", "out", "r/o", "vs", "versus");

    private static final String WEB_SEARCH_INSTRUCTION_TEMPLATE = """
        You are a medical research assistant supporting hospital triage staff in India (not the patient).
        You have a live web_search tool - actually use it, do not answer from memory alone. For this case,
        run at least two distinct searches:
          1. current medical/clinical information on the suspected condition or presenting complaint,
          2. recent news (last few weeks) about disease outbreaks, seasonal surges, or public-health
             advisories specifically for %s, India, that could plausibly relate to this presentation.
        If prior peer-reviewed excerpts are supplied below, treat them as additional grounding alongside
        your own live results - reason over everything together.

        Write a concise educational briefing for staff: 4-6 lines, each starting with "- ". Cover what the
        condition typically involves and warning signs to watch for. Keep numbers explicit.
        - If a local news result shows a matching outbreak or seasonal surge, add a line starting
          "LOCAL ALERT:" naming the disease and why it may be relevant here.
        - Start any truly time-critical clinical line with "WARNING:".
        - Finish with one line starting "Suggested tests:" listing 2-4 relevant investigations.
        Do NOT prescribe medication, dosages, or a treatment plan. No definitive diagnosis.
        """;

    private static final String FALLBACK_SUMMARY_INSTRUCTION = """
        You are a medical research assistant supporting hospital triage staff (not the patient).
        Given a patient's presentation and excerpts from public medical reference articles,
        write a concise educational briefing.
        Format: 3-5 lines, each starting with "- ". Cover what the condition typically involves,
        warning signs staff should watch for, and assessment considerations. Keep numbers explicit.
        Start any truly time-critical line with "WARNING:". Finish with a line starting
        "Suggested tests:" listing 2-4 relevant investigations.
        Do NOT prescribe medication, dosages, or a treatment plan. No definitive diagnosis.
        """;

    private final PatientTimelineEventRepository timelineRepository;
    private final PatientThreadCommentRepository threadCommentRepository;
    private final SystemAgentService systemAgentService;
    private final WorkflowStreamService workflowStream;
    private final SpringAiChatService springAiChatService;
    private final OpenAiResponsesClient openAiResponsesClient;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    private final String ncbiApiKey;
    private final String localCity;

    public MedicalResearchAgent(PatientTimelineEventRepository timelineRepository,
                                PatientThreadCommentRepository threadCommentRepository,
                                SystemAgentService systemAgentService,
                                WorkflowStreamService workflowStream,
                                SpringAiChatService springAiChatService,
                                OpenAiResponsesClient openAiResponsesClient,
                                ObjectMapper objectMapper,
                                @org.springframework.beans.factory.annotation.Value("${research.ncbi-api-key:}") String ncbiApiKey,
                                @org.springframework.beans.factory.annotation.Value("${research.local-city:Delhi}") String localCity) {
        this.ncbiApiKey = ncbiApiKey;
        this.localCity = (localCity == null || localCity.isBlank()) ? "Delhi" : localCity.trim();
        this.timelineRepository = timelineRepository;
        this.threadCommentRepository = threadCommentRepository;
        this.systemAgentService = systemAgentService;
        this.workflowStream = workflowStream;
        this.springAiChatService = springAiChatService;
        this.openAiResponsesClient = openAiResponsesClient;
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
        String primaryTopic = queries.isEmpty() ? intake.getChiefComplaint() : queries.get(0);
        workflowStream.publish(displayId, "RESEARCH_STARTED", AGENT_NAME, "Researching live",
            "Gathering PubMed grounding, then reasoning with a live web search over medical sources "
                + "and " + localCity + " news for \"" + primaryTopic + "\".",
            researchStartReasoning(suggestedDiagnosis, queries));

        try {
            List<Article> pubmedArticles = new ArrayList<>();
            for (String query : queries) {
                pubmedArticles = new ArrayList<>(searchPubMed(query));
                log.info("PubMed query '{}' for {} returned {} articles", query, displayId, pubmedArticles.size());
                if (!pubmedArticles.isEmpty()) {
                    break;
                }
            }

            WebSearchOutcome webOutcome = runLiveWebSearch(intake, suggestedDiagnosis, pubmedArticles, displayId);

            String briefing;
            List<Citation> citations;
            if (webOutcome != null && StringUtils.hasText(webOutcome.text())) {
                briefing = webOutcome.text().trim();
                citations = mergeCitations(pubmedArticles, webOutcome.citations());
                workflowStream.publish(displayId, "RESEARCH_SOURCES", AGENT_NAME, "Live search complete",
                    "The agent ran its own live web search and found %d real source(s), plus %d PubMed article(s).".formatted(
                        webOutcome.citations().size(), pubmedArticles.size()),
                    liveSearchReasoning(webOutcome, pubmedArticles));
            } else if (!pubmedArticles.isEmpty()) {
                briefing = fallbackSummarize(intake, suggestedDiagnosis, pubmedArticles);
                citations = pubmedArticles.stream().map(a -> new Citation(a.title(), a.url())).toList();
                workflowStream.publish(displayId, "RESEARCH_SOURCES", AGENT_NAME, "Using PubMed only",
                    "Live web search was unavailable; the briefing is grounded in %d PubMed article(s) instead.".formatted(pubmedArticles.size()),
                    "Live web search either returned nothing or the OpenAI web-search tool is not reachable/enabled "
                        + "for the configured account or model. Falling back to PubMed-only grounding so research "
                        + "still reaches the patient record.");
            } else {
                workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "No research available",
                    "Neither PubMed nor live web search returned usable results for \"" + primaryTopic + "\".",
                    "PubMed had no matching articles and the live web search either found nothing or is unavailable "
                        + "(check OPENAI_API_KEY / model access to the web_search tool). Staff should rely on the "
                        + "triage assessment. Research can be retried on the next intake.");
                return Optional.empty();
            }

            citations = citations.size() <= MAX_CITATIONS_SAVED ? citations : citations.subList(0, MAX_CITATIONS_SAVED);
            saveResearch(patient, intake, citations, briefing);

            workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "Research saved to patient record",
                "Briefing and %d citations saved to %s's thread. Findings now feed queue sorting and doctor assignment.".formatted(
                    citations.size(), displayId),
                savedReasoning(briefing, citations));
            return Optional.of(new ResearchOutcome(briefing, citations));
        } catch (Exception failure) {
            log.warn("Medical research failed for {}: {}", displayId, failure.toString());
            workflowStream.publish(displayId, "RESEARCH_SAVED", AGENT_NAME, "Research unavailable",
                "Online research failed (" + shorten(failure.getMessage(), 120) + "). Workflow continues without it.",
                "The agent could not complete PubMed or live web search (network error or timeout). "
                    + "The remaining agents still run; research can be retried on the next intake.");
            return Optional.empty();
        }
    }

    /** Non-fatal: a web-search outage never blocks the rest of the intake workflow. */
    private WebSearchOutcome runLiveWebSearch(Intake intake, String suggestedDiagnosis, List<Article> pubmedArticles, String displayId) {
        if (!openAiResponsesClient.isAvailable()) {
            return null;
        }
        try {
            String instruction = WEB_SEARCH_INSTRUCTION_TEMPLATE.formatted(localCity);
            StringBuilder userInput = new StringBuilder();
            userInput.append("Hospital city: ").append(localCity).append("\n");
            userInput.append("Patient presentation: ").append(intake.getChiefComplaint());
            if (intake.getStructuredSymptoms() != null && !intake.getStructuredSymptoms().isEmpty()) {
                userInput.append(" | symptoms: ").append(String.join(", ", intake.getStructuredSymptoms()));
            }
            if (StringUtils.hasText(suggestedDiagnosis)) {
                userInput.append(" | triage concern: ").append(suggestedDiagnosis);
            }
            if (!pubmedArticles.isEmpty()) {
                userInput.append("\n\nPrior peer-reviewed excerpts (optional grounding):\n");
                pubmedArticles.forEach(article -> userInput.append("- ").append(article.title()).append(": ")
                    .append(shorten(article.summary(), 400)).append("\n"));
            }
            return openAiResponsesClient.respondWithWebSearch(instruction, userInput.toString());
        } catch (Exception webSearchFailure) {
            log.warn("Live web search failed for {}: {}", displayId, webSearchFailure.getMessage());
            return null;
        }
    }

    /** PubMed citations first (peer-reviewed), then whatever the live web search actually cited, deduped by URL. */
    private List<Citation> mergeCitations(List<Article> pubmedArticles, List<WebCitation> webCitations) {
        Map<String, Citation> byUrl = new LinkedHashMap<>();
        pubmedArticles.forEach(article -> byUrl.putIfAbsent(article.url(), new Citation(article.title(), article.url())));
        webCitations.forEach(citation -> byUrl.putIfAbsent(citation.url(), new Citation(citation.title(), citation.url())));
        return new ArrayList<>(byUrl.values());
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
        reasoning.append("- Tools: PubMed (NCBI E-utilities) for peer-reviewed grounding, then an LLM call armed "
            + "with a live web_search tool - the model itself decides what to search (current medical guidance, "
            + "plus recent " + localCity + " health news) and reasons over the real results. Nothing here is a "
            + "fixed link set; the sources differ every time.\n");
        reasoning.append("- PubMed query plan (tried in order until articles are found):\n");
        queries.forEach(query -> reasoning.append("  - \"").append(query).append("\"\n"));
        reasoning.append("- Its findings are saved to the record and handed to the Priority and Assignment agents. "
            + "A human still reviews the briefing before it drives any action.");
        return reasoning.toString();
    }

    private String liveSearchReasoning(WebSearchOutcome webOutcome, List<Article> pubmedArticles) {
        StringBuilder reasoning = new StringBuilder(
            "The model ran its own live web search (medical sources + local news) and reasoned over the results:\n");
        webOutcome.citations().forEach(citation -> reasoning.append("- ").append(citation.title())
            .append(" ").append(citation.url()).append("\n"));
        if (!pubmedArticles.isEmpty()) {
            reasoning.append("Plus PubMed grounding:\n");
            pubmedArticles.forEach(article -> reasoning.append("- [PubMed] ").append(article.title())
                .append(" ").append(article.url()).append("\n"));
        }
        reasoning.append("The agent now writes the briefing from this live-reasoned context.");
        return reasoning.toString();
    }

    private String savedReasoning(String briefing, List<Citation> citations) {
        StringBuilder reasoning = new StringBuilder("Briefing written from live research:\n");
        reasoning.append(briefing).append("\n\nCitations attached to the patient record:\n");
        citations.forEach(citation -> reasoning.append("- ").append(citation.title())
            .append(" ").append(citation.url()).append("\n"));
        return reasoning.toString();
    }

    /** PubMed via NCBI E-utilities: esearch for PMIDs, esummary for titles, efetch for abstracts. */
    private List<Article> searchPubMed(String query) throws Exception {
        String keyParam = StringUtils.hasText(ncbiApiKey) ? "&api_key=" + ncbiApiKey : "";
        String searchUrl = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
            + "?db=pubmed&retmode=json&sort=relevance&retmax=%d&term=%s%s")
            .formatted(MAX_PUBMED_ARTICLES, URLEncoder.encode(query, StandardCharsets.UTF_8), keyParam);
        JsonNode idList = objectMapper.readTree(restClient.get().uri(searchUrl).retrieve().body(String.class))
            .path("esearchresult").path("idlist");
        List<String> pmids = new ArrayList<>();
        idList.forEach(id -> pmids.add(id.asText()));
        if (pmids.isEmpty()) {
            return List.of();
        }

        String joinedIds = String.join(",", pmids);
        String summaryUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=%s%s"
            .formatted(joinedIds, keyParam);
        JsonNode summaryResult = objectMapper.readTree(restClient.get().uri(summaryUrl).retrieve().body(String.class))
            .path("result");

        List<Article> articles = new ArrayList<>();
        for (String pmid : pmids) {
            JsonNode entry = summaryResult.path(pmid);
            String title = entry.path("title").asText("");
            if (title.isBlank()) {
                continue;
            }
            String journal = entry.path("fulljournalname").asText("");
            String pubDate = entry.path("pubdate").asText("");
            String abstractText = fetchPubMedAbstract(pmid, keyParam);
            String summary = StringUtils.hasText(abstractText)
                ? abstractText
                : "%s (%s).".formatted(journal.isBlank() ? "PubMed-indexed article" : journal, pubDate);
            articles.add(new Article(title, "https://pubmed.ncbi.nlm.nih.gov/" + pmid + "/", summary));
        }
        return articles;
    }

    private String fetchPubMedAbstract(String pmid, String keyParam) {
        try {
            String url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&rettype=abstract&retmode=text&id=%s%s"
                .formatted(pmid, keyParam);
            String text = restClient.get().uri(url).retrieve().body(String.class);
            return text == null ? "" : shorten(text, 700);
        } catch (Exception abstractFailure) {
            return "";
        }
    }

    /** Used only if live web search is unavailable and we have PubMed excerpts to summarize. */
    private String fallbackSummarize(Intake intake, String suggestedDiagnosis, List<Article> articles) {
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
            articles.forEach(article -> userInput.append("- [PubMed] ")
                .append(article.title()).append(": ")
                .append(shorten(article.summary(), 500)).append("\n"));
            String summary = springAiChatService.respond(FALLBACK_SUMMARY_INSTRUCTION, userInput.toString());
            if (StringUtils.hasText(summary)) {
                return summary.trim();
            }
        } catch (Exception summaryFailure) {
            log.warn("Research LLM fallback summary failed, using raw article extracts: {}", summaryFailure.getMessage());
        }
        return articles.stream()
            .map(article -> "- " + article.title() + ": " + shorten(article.summary(), 300))
            .reduce((a, b) -> a + "\n" + b)
            .orElse("No briefing available.");
    }

    private void saveResearch(Patient patient, Intake intake, List<Citation> citations, String briefing) {
        StringBuilder note = new StringBuilder("Medical research briefing for ")
            .append(intake.getChiefComplaint())
            .append(" (live agentic web research):\n\n")
            .append(briefing)
            .append("\n\nSources:");
        citations.forEach(citation -> note.append("\n- ").append(citation.title()).append(" (").append(citation.url()).append(")"));

        PatientThreadComment comment = new PatientThreadComment(patient, intake, AGENT_NAME, note.toString());
        citations.forEach(citation -> comment.addAttachment(new PatientThreadAttachment(
            citation.title(),
            "text/html",
            citation.url()
        )));
        threadCommentRepository.save(comment);

        timelineRepository.save(new PatientTimelineEvent(
            patient,
            intake,
            null,
            "MEDICAL_RESEARCH",
            "Medical research saved",
            shorten("%s ran a live web search for \"%s\", wrote a briefing, and attached %d real citations to the patient thread.".formatted(
                AGENT_NAME, intake.getChiefComplaint(), citations.size()), 990),
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
