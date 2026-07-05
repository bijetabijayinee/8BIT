package com.careflowai.staff;

import com.careflowai.common.StaffRole;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffUserRepository extends JpaRepository<StaffUser, UUID> {
    Optional<StaffUser> findTopByDisplayNameOrderByCreatedAtDesc(String displayName);

    Optional<StaffUser> findByStaffCodeIgnoreCase(String staffCode);

    Optional<StaffUser> findFirstByRoleAndDepartmentIgnoreCaseAndActiveTrueOrderByCreatedAtAsc(
        StaffRole role,
        String department
    );

    Optional<StaffUser> findFirstByRoleAndDepartmentIgnoreCaseAndSpecialtyIgnoreCaseAndActiveTrueOrderByCreatedAtAsc(
        StaffRole role,
        String department,
        String specialty
    );

    Optional<StaffUser> findFirstByRoleAndActiveTrueOrderByCreatedAtAsc(StaffRole role);

    List<StaffUser> findByRoleAndActiveTrueOrderByCreatedAtAsc(StaffRole role);

    List<StaffUser> findByRoleOrderByCreatedAtDesc(StaffRole role);

    List<StaffUser> findByDepartmentIgnoreCaseOrderByCreatedAtDesc(String department);

    List<StaffUser> findByRoleAndDepartmentIgnoreCaseOrderByCreatedAtDesc(StaffRole role, String department);

    boolean existsByStaffCodeIgnoreCase(String staffCode);

    List<StaffUser> findByPasswordHashIsNull();
}
