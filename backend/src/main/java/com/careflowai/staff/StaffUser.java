package com.careflowai.staff;

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
public class StaffUser {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false, unique = true)
    private String staffCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StaffRole role;

    private String department;

    private String specialty;

    @Column(nullable = false)
    private boolean active = true;

    private String passwordHash;

    @Column(nullable = false)
    private Instant createdAt;

    protected StaffUser() {
    }

    public StaffUser(String displayName, StaffRole role, String department) {
        this.displayName = displayName;
        this.staffCode = generateStaffCode(displayName, role);
        this.role = role;
        this.department = department;
    }

    public StaffUser(String displayName, String staffCode, StaffRole role, String department, String specialty) {
        this.displayName = displayName;
        this.staffCode = staffCode;
        this.role = role;
        this.department = department;
        this.specialty = specialty;
    }

    public boolean hasRole(StaffRole role) {
        return this.role == role;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getStaffCode() {
        return staffCode;
    }

    public StaffRole getRole() {
        return role;
    }

    public String getDepartment() {
        return department;
    }

    public String getSpecialty() {
        return specialty;
    }

    public boolean isActive() {
        return active;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void updateProfile(String displayName, String staffCode, StaffRole role, String department,
                              String specialty, boolean active) {
        this.displayName = displayName;
        this.staffCode = staffCode;
        this.role = role;
        this.department = department;
        this.specialty = specialty;
        this.active = active;
    }

    public void deactivate() {
        this.active = false;
    }

    private static String generateStaffCode(String displayName, StaffRole role) {
        String prefix = switch (role) {
            case INTAKE_STAFF -> "INTAKE";
            case DOCTOR -> "DOCTOR";
            case TRIAGE_NURSE -> "TRIAGE";
            case CHARGE_NURSE -> "CHARGE";
            case ADMIN -> "ADMIN";
        };
        String initials = displayName == null ? "STAFF" : displayName.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (initials.length() > 6) {
            initials = initials.substring(0, 6);
        }
        if (initials.isBlank()) {
            initials = "STAFF";
        }
        return prefix + "-" + initials + "-" + Instant.now().toEpochMilli();
    }
}
