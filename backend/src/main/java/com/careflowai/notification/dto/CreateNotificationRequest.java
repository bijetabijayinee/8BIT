package com.careflowai.notification.dto;

/**
 * Staff-initiated notification (e.g. a charge nurse pinging an engaged doctor from the
 * queue). recipientStaffLookup is the doctor's staff code or id; the recipient role is
 * resolved from that staff member so the message lands in their feed.
 */
public record CreateNotificationRequest(
    String recipientStaffLookup,
    String patientDisplayId,
    String category,
    String title,
    String body,
    String agent
) {
}
