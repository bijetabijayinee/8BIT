package com.careflowai.notification;

import com.careflowai.common.StaffRole;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import java.time.Instant;
import java.util.UUID;

@Entity
public class StaffNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StaffRole recipientRole;

    private UUID recipientStaffId;

    private UUID patientId;

    private String patientDisplayId;

    @Column(nullable = false)
    private String agent;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(nullable = false)
    private boolean readFlag;

    @Column(nullable = false)
    private Instant createdAt;

    protected StaffNotification() {
    }

    public StaffNotification(StaffRole recipientRole, UUID recipientStaffId, UUID patientId, String patientDisplayId,
                             String agent, String category, String title, String body) {
        this.recipientRole = recipientRole;
        this.recipientStaffId = recipientStaffId;
        this.patientId = patientId;
        this.patientDisplayId = patientDisplayId;
        this.agent = agent;
        this.category = category;
        this.title = title;
        this.body = body;
        this.readFlag = false;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public void markRead() {
        this.readFlag = true;
    }

    public UUID getId() {
        return id;
    }

    public StaffRole getRecipientRole() {
        return recipientRole;
    }

    public UUID getRecipientStaffId() {
        return recipientStaffId;
    }

    public UUID getPatientId() {
        return patientId;
    }

    public String getPatientDisplayId() {
        return patientDisplayId;
    }

    public String getAgent() {
        return agent;
    }

    public String getCategory() {
        return category;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public boolean isRead() {
        return readFlag;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
