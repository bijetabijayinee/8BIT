package com.careflowai.notification.dto;

import com.careflowai.common.StaffRole;
import com.careflowai.notification.StaffNotification;
import java.time.Instant;
import java.util.UUID;

public record StaffNotificationResponse(
    UUID id,
    StaffRole recipientRole,
    String patientDisplayId,
    String agent,
    String category,
    String title,
    String body,
    boolean read,
    Instant createdAt
) {
    public static StaffNotificationResponse from(StaffNotification notification) {
        return new StaffNotificationResponse(
            notification.getId(),
            notification.getRecipientRole(),
            notification.getPatientDisplayId(),
            notification.getAgent(),
            notification.getCategory(),
            notification.getTitle(),
            notification.getBody(),
            notification.isRead(),
            notification.getCreatedAt()
        );
    }
}
