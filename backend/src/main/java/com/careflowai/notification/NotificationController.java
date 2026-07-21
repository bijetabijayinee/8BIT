package com.careflowai.notification;

import com.careflowai.common.StaffRole;
import com.careflowai.notification.dto.CreateNotificationRequest;
import com.careflowai.notification.dto.StaffNotificationResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<StaffNotificationResponse> feed(@RequestParam(required = false) StaffRole role,
                                                @RequestParam(required = false) String staffLookup) {
        return notificationService.feed(role, staffLookup);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StaffNotificationResponse create(@RequestBody CreateNotificationRequest request) {
        return notificationService.create(request);
    }

    @PostMapping("/{notificationId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@PathVariable UUID notificationId) {
        notificationService.markRead(notificationId);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead(@RequestParam(required = false) StaffRole role,
                            @RequestParam(required = false) String staffLookup) {
        notificationService.markAllRead(role, staffLookup);
    }
}
