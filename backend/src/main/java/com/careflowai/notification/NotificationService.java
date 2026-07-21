package com.careflowai.notification;

import com.careflowai.common.StaffRole;
import com.careflowai.notification.dto.CreateNotificationRequest;
import com.careflowai.notification.dto.StaffNotificationResponse;
import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserService;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationService {

    private static final int FEED_LIMIT = 40;

    private final StaffNotificationRepository notificationRepository;
    private final StaffUserService staffUserService;

    public NotificationService(StaffNotificationRepository notificationRepository,
                               StaffUserService staffUserService) {
        this.notificationRepository = notificationRepository;
        this.staffUserService = staffUserService;
    }

    @Transactional
    public void notifyStaff(StaffRole role, UUID recipientStaffId, UUID patientId, String patientDisplayId,
                            String agent, String category, String title, String body) {
        notificationRepository.save(new StaffNotification(
            role, recipientStaffId, patientId, patientDisplayId, agent, category, title, body
        ));
    }

    @Transactional
    public StaffNotificationResponse create(CreateNotificationRequest request) {
        if (request == null || !StringUtils.hasText(request.recipientStaffLookup())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A recipient staff member is required.");
        }
        if (!StringUtils.hasText(request.title()) || !StringUtils.hasText(request.body())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A title and message are required.");
        }
        StaffUser recipient;
        try {
            recipient = staffUserService.getByLookup(request.recipientStaffLookup().trim());
        } catch (Exception unresolved) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipient staff member not found.");
        }
        String category = StringUtils.hasText(request.category()) ? request.category().trim() : "STAFF_MESSAGE";
        String agent = StringUtils.hasText(request.agent()) ? request.agent().trim() : "Care team";
        String patientDisplayId = StringUtils.hasText(request.patientDisplayId()) ? request.patientDisplayId().trim() : null;
        StaffNotification saved = notificationRepository.save(new StaffNotification(
            recipient.getRole(),
            recipient.getId(),
            null,
            patientDisplayId,
            agent,
            category,
            request.title().trim(),
            request.body().trim()
        ));
        return StaffNotificationResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<StaffNotificationResponse> feed(StaffRole role, String staffLookup) {
        StaffRole targetRole = role;
        UUID staffId = null;
        if (StringUtils.hasText(staffLookup)) {
            try {
                StaffUser staff = staffUserService.getByLookup(staffLookup.trim());
                targetRole = staff.getRole();
                staffId = staff.getId();
            } catch (Exception ignored) {
                // Fall back to role-only feed when the staff lookup cannot be resolved.
            }
        }
        if (targetRole == null) {
            return List.of();
        }
        Pageable pageable = PageRequest.of(0, FEED_LIMIT);
        return notificationRepository.findForRecipient(targetRole, staffId, pageable).stream()
            .map(StaffNotificationResponse::from)
            .toList();
    }

    @Transactional
    public void markRead(UUID notificationId) {
        StaffNotification notification = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found."));
        notification.markRead();
    }

    @Transactional
    public void markAllRead(StaffRole role, String staffLookup) {
        feed(role, staffLookup).stream()
            .filter(notification -> !notification.read())
            .forEach(notification -> notificationRepository.findById(notification.id())
                .ifPresent(StaffNotification::markRead));
    }
}
