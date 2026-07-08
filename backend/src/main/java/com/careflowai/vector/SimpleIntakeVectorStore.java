package com.careflowai.vector;

import com.careflowai.assessment.UrgencyAssessment;
import com.careflowai.intake.Intake;
import com.careflowai.queue.QueueEntry;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SimpleIntakeVectorStore {

    private static final int FALLBACK_DIMENSIONS = 128;

    private final IntakeVectorDocumentRepository repository;
    private final KnowledgeDocumentRepository knowledgeDocumentRepository;
    private final ObjectProvider<EmbeddingModel> embeddingModelProvider;

    public SimpleIntakeVectorStore(IntakeVectorDocumentRepository repository,
                                   KnowledgeDocumentRepository knowledgeDocumentRepository,
                                   ObjectProvider<EmbeddingModel> embeddingModelProvider) {
        this.repository = repository;
        this.knowledgeDocumentRepository = knowledgeDocumentRepository;
        this.embeddingModelProvider = embeddingModelProvider;
    }

    @Transactional
    public void indexIntake(Intake intake, UrgencyAssessment assessment) {
        indexIntake(intake, assessment, null);
    }

    @Transactional
    public void indexQueueEntry(QueueEntry entry, UrgencyAssessment assessment, String assignmentSummary) {
        indexIntake(entry.getIntake(), assessment, """
            Live queue state: status %s, queue department %s, urgency %s score %d, staff escalated %s.
            %s
            """.formatted(
            entry.getStatus(),
            entry.getDepartment(),
            entry.getUrgencyCategory(),
            entry.getUrgencyScore(),
            entry.isStaffEscalated(),
            assignmentSummary == null || assignmentSummary.isBlank() ? "No active doctor assignment recorded." : assignmentSummary
        ));
    }

    @Transactional
    public void indexIntake(Intake intake, UrgencyAssessment assessment, String operationalContext) {
        String content = intakeContent(intake, assessment, operationalContext);
        String embedding = serialize(embed(content));
        IntakeVectorDocument document = repository.findByIntakeId(intake.getId())
            .orElseGet(() -> new IntakeVectorDocument(
                intake,
                intake.getPatient(),
                intake.getPatient().getDisplayId(),
                content,
                embedding
            ));
        document.refresh(content, embedding);
        repository.save(document);
    }

    @Transactional
    public KnowledgeDocument indexKnowledge(String title, String fileName, String content) {
        String safeTitle = title == null || title.isBlank() ? fileName : title.trim();
        String safeFileName = fileName == null || fileName.isBlank() ? "uploaded-knowledge.txt" : fileName.trim();
        String safeContent = content == null || content.isBlank() ? "No readable text was extracted." : content.trim();
        return knowledgeDocumentRepository.save(new KnowledgeDocument(
            safeTitle,
            safeFileName,
            safeContent,
            serialize(embed(safeTitle + "\n" + safeContent))
        ));
    }

    @Transactional(readOnly = true)
    public List<KnowledgeDocument> listKnowledge() {
        return knowledgeDocumentRepository.findAllByOrderByUpdatedAtDesc();
    }

    @Transactional
    public List<SearchResult> search(String query, int limit) {
        float[] queryVector = embed(query);
        boolean semanticSearch = hasEmbeddingModel();
        return repository.findAll().stream()
            .map(document -> new SearchResult(document, score(query, queryVector, document, semanticSearch)))
            .filter(result -> result.score() > 0)
            .sorted(Comparator.comparingDouble(SearchResult::score).reversed())
            .limit(limit)
            .toList();
    }

    @Transactional
    public List<KnowledgeSearchResult> searchKnowledge(String query, int limit) {
        float[] queryVector = embed(query);
        return knowledgeDocumentRepository.findAll().stream()
            .map(document -> new KnowledgeSearchResult(document, knowledgeScore(query, queryVector, document)))
            .filter(result -> result.score() > 0)
            .sorted(Comparator.comparingDouble(KnowledgeSearchResult::score).reversed())
            .limit(limit)
            .toList();
    }

    private String intakeContent(Intake intake, UrgencyAssessment assessment, String operationalContext) {
        String assessmentSummary = assessment == null
            ? "Assessment not available."
            : "Urgency " + assessment.getFinalCategory() + " score " + assessment.getFinalScore()
                + ". Suggested diagnosis " + valueOrUnknown(assessment.getSuggestedDiagnosis())
                + ". Medical attention note " + valueOrUnknown(assessment.getMedicalAttentionNote())
                + ". Symptom summary " + valueOrUnknown(assessment.getStructuredSymptomSummary())
                + ". Red flags " + (assessment.getRedFlagIndicators().isEmpty() ? "none" : String.join(", ", assessment.getRedFlagIndicators()))
                + ". Missing details " + (assessment.getMissingOrAmbiguousDetails().isEmpty() ? "none" : String.join(", ", assessment.getMissingOrAmbiguousDetails()))
                + ". Factors " + String.join(", ", assessment.getScoreFactors()) + ".";
        return """
            Patient %s. Age band %s. Department %s. Status %s. Arrival %s via %s.
            Chief complaint: %s. Symptoms: %s. Notes: %s. Distress score %d.
            Vitals: age %s, height %s cm, weight %s kg, temperature %s C, heart rate %s, blood pressure %s/%s, respiratory rate %s, oxygen %s.
            Risk flags: chest pain %s, breathing difficulty %s, altered mental state %s, severe bleeding %s,
            pregnancy %s, pediatric risk %s, fall or trauma %s, immunocompromised %s.
            %s
            %s
            """.formatted(
            intake.getPatient().getDisplayId(),
            intake.getPatient().getAgeBand(),
            intake.getDepartment(),
            intake.getCurrentStatus(),
            intake.getArrivalTimestamp(),
            intake.getArrivalMode(),
            intake.getChiefComplaint(),
            intake.getStructuredSymptoms().isEmpty() ? "none recorded" : String.join(", ", intake.getStructuredSymptoms()),
            valueOrUnknown(intake.getSymptomNotes()),
            intake.getPainLevel(),
            valueOrUnknown(intake.getVitals().getAge()),
            valueOrUnknown(intake.getVitals().getHeightCm()),
            valueOrUnknown(intake.getVitals().getWeightKg()),
            valueOrUnknown(intake.getVitals().getTemperatureC()),
            valueOrUnknown(intake.getVitals().getHeartRate()),
            valueOrUnknown(intake.getVitals().getSystolicPressure()),
            valueOrUnknown(intake.getVitals().getDiastolicPressure()),
            valueOrUnknown(intake.getVitals().getRespiratoryRate()),
            valueOrUnknown(intake.getVitals().getOxygenSaturation()),
            intake.getRiskFlags().isChestPain(),
            intake.getRiskFlags().isBreathingDifficulty(),
            intake.getRiskFlags().isAlteredMentalState(),
            intake.getRiskFlags().isSevereBleeding(),
            intake.getRiskFlags().isPregnancy(),
            intake.getRiskFlags().isPediatricRisk(),
            intake.getRiskFlags().isFallOrTrauma(),
            intake.getRiskFlags().isImmunocompromised(),
            assessmentSummary,
            operationalContext == null || operationalContext.isBlank() ? "" : operationalContext.trim()
        );
    }

    private float[] embed(String text) {
        EmbeddingModel embeddingModel = embeddingModelProvider.getIfAvailable();
        if (embeddingModel != null) {
            try {
                return embeddingModel.embed(text == null ? "" : text);
            } catch (Exception ignored) {
                // Local lexical fallback keeps intake/chat usable when embedding calls are unavailable.
            }
        }
        return lexicalEmbed(text);
    }

    private boolean hasEmbeddingModel() {
        return embeddingModelProvider.getIfAvailable() != null;
    }

    private double score(String query, float[] queryVector, IntakeVectorDocument document, boolean semanticSearch) {
        float[] documentVector = deserialize(document.getEmbedding());
        if (semanticSearch && documentVector.length != queryVector.length) {
            documentVector = embed(document.getContent());
            document.refresh(document.getContent(), serialize(documentVector));
            repository.save(document);
        }
        double semanticScore = documentVector.length == queryVector.length
            ? cosine(queryVector, documentVector)
            : 0;
        double lexicalScore = lexicalSimilarity(query, document.getContent());
        return Math.max(semanticScore, lexicalScore);
    }

    private double knowledgeScore(String query, float[] queryVector, KnowledgeDocument document) {
        float[] documentVector = deserialize(document.getEmbedding());
        double semanticScore = documentVector.length == queryVector.length
            ? cosine(queryVector, documentVector)
            : 0;
        double lexicalScore = lexicalSimilarity(query, document.getTitle() + " " + document.getContent());
        return Math.max(semanticScore, lexicalScore);
    }

    private float[] lexicalEmbed(String text) {
        float[] vector = new float[FALLBACK_DIMENSIONS];
        if (text == null || text.isBlank()) {
            return vector;
        }
        Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
            .filter(token -> token.length() > 1)
            .forEach(token -> vector[Math.floorMod(token.hashCode(), FALLBACK_DIMENSIONS)] += 1.0f);
        return vector;
    }

    private double cosine(float[] first, float[] second) {
        double dot = 0;
        double firstNorm = 0;
        double secondNorm = 0;
        for (int index = 0; index < Math.min(first.length, second.length); index++) {
            dot += first[index] * second[index];
            firstNorm += first[index] * first[index];
            secondNorm += second[index] * second[index];
        }
        if (firstNorm == 0 || secondNorm == 0) {
            return 0;
        }
        return dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm));
    }

    private String serialize(float[] vector) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < vector.length; index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(Float.toString(vector[index]));
        }
        return builder.toString();
    }

    private float[] deserialize(String embedding) {
        if (embedding == null || embedding.isBlank()) {
            return new float[0];
        }
        String[] parts = embedding.split(",");
        float[] vector = new float[parts.length];
        for (int index = 0; index < parts.length; index++) {
            try {
                vector[index] = Float.parseFloat(parts[index]);
            } catch (NumberFormatException ignored) {
                vector[index] = 0;
            }
        }
        return vector;
    }

    private double lexicalSimilarity(String query, String content) {
        float[] queryVector = lexicalEmbed(query);
        float[] contentVector = lexicalEmbed(content);
        return cosine(queryVector, contentVector) * 0.82d;
    }

    @Transactional
    public void reindexAllLocalEmbeddings() {
        List<IntakeVectorDocument> documents = repository.findAll();
        documents.forEach(document -> document.refresh(document.getContent(), serialize(embed(document.getContent()))));
        repository.saveAll(documents);
    }

    private String valueOrUnknown(Object value) {
        return value == null || value.toString().isBlank() ? "unknown" : value.toString();
    }

    public record SearchResult(IntakeVectorDocument document, double score) {
    }

    public record KnowledgeSearchResult(KnowledgeDocument document, double score) {
    }
}
