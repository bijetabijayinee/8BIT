package com.careflowai.vector;

import com.careflowai.vector.dto.KnowledgeDocumentResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeController.class);

    private final SimpleIntakeVectorStore vectorStore;

    public KnowledgeController(SimpleIntakeVectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @GetMapping
    public List<KnowledgeDocumentResponse> list() {
        return vectorStore.listKnowledge().stream()
            .map(KnowledgeDocumentResponse::from)
            .toList();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public KnowledgeDocumentResponse upload(@RequestParam("file") MultipartFile file,
                                            @RequestParam(required = false) String title) throws IOException {
        String fileName = StringUtils.hasText(file.getOriginalFilename())
            ? file.getOriginalFilename()
            : "hospital-knowledge.txt";
        String content = extractReadableText(fileName, file.getBytes());
        String safeTitle = StringUtils.hasText(title) ? title.trim() : fileName;
        return KnowledgeDocumentResponse.from(vectorStore.indexKnowledge(safeTitle, fileName, content));
    }

    private String extractReadableText(String fileName, byte[] bytes) {
        if (isPdf(fileName, bytes)) {
            String pdfText = extractPdfText(bytes);
            if (StringUtils.hasText(pdfText)) {
                return limit(pdfText);
            }
        }
        String raw = new String(bytes, StandardCharsets.UTF_8);
        String normalized = raw
            .replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E\\u00A0-\\uFFFF]", " ")
            .replaceAll("[ \\t]+", " ")
            .trim();
        return limit(normalized);
    }

    private boolean isPdf(String fileName, byte[] bytes) {
        boolean pdfName = fileName != null && fileName.toLowerCase(Locale.ROOT).endsWith(".pdf");
        boolean pdfMagic = bytes.length > 4
            && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
        return pdfName || pdfMagic;
    }

    private String extractPdfText(byte[] bytes) {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(document).replaceAll("[ \\t]+", " ").trim();
        } catch (Exception extractionFailure) {
            log.warn("PDF text extraction failed: {}", extractionFailure.getMessage());
            return "";
        }
    }

    private String limit(String content) {
        if (content.length() > 200_000) {
            return content.substring(0, 200_000);
        }
        return content;
    }
}
