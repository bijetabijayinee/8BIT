package com.careflowai.notification;

import com.careflowai.common.StaffRole;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StaffNotificationRepository extends JpaRepository<StaffNotification, UUID> {

    @Query("""
        select n from StaffNotification n
        where n.recipientRole = :role
          and (n.recipientStaffId is null or :staffId is null or n.recipientStaffId = :staffId)
        order by n.createdAt desc
        """)
    List<StaffNotification> findForRecipient(@Param("role") StaffRole role,
                                             @Param("staffId") UUID staffId,
                                             Pageable pageable);
}
