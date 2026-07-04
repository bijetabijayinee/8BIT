package com.careflowai;

import com.careflowai.ai.AiServiceProperties;
import com.careflowai.ai.OpenAiProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
@EnableConfigurationProperties({OpenAiProperties.class, AiServiceProperties.class})
public class CareflowAiApplication {

    public static void main(String[] args) {
        configureWindowsTrustStore();
        SpringApplication.run(CareflowAiApplication.class, args);
    }

    private static void configureWindowsTrustStore() {
        String osName = System.getProperty("os.name", "");
        if (!osName.toLowerCase().contains("win")) {
            return;
        }
        if (hasText(System.getProperty("javax.net.ssl.trustStore"))
            || hasText(System.getProperty("javax.net.ssl.trustStoreType"))) {
            return;
        }
        System.setProperty("javax.net.ssl.trustStoreType", "Windows-ROOT");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
