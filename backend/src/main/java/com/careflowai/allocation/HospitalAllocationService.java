package com.careflowai.allocation;

import com.careflowai.agent.CareTeamAssignment;
import com.careflowai.agent.CareTeamAssignmentRepository;
import com.careflowai.allocation.dto.AllocationSummaryResponse;
import com.careflowai.allocation.dto.BedAllocationResponse;
import com.careflowai.allocation.dto.DoctorAllocationResponse;
import com.careflowai.allocation.dto.HospitalAllocationResponse;
import com.careflowai.common.QueueStatus;
import com.careflowai.common.StaffRole;
import com.careflowai.queue.QueueEntry;
import com.careflowai.queue.QueueEntryRepository;
import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HospitalAllocationService {

    private static final int DEFAULT_DEPARTMENT_BEDS = 6;

    private final QueueEntryRepository queueEntryRepository;
    private final StaffUserRepository staffUserRepository;
    private final CareTeamAssignmentRepository assignmentRepository;

    public HospitalAllocationService(QueueEntryRepository queueEntryRepository,
                                     StaffUserRepository staffUserRepository,
                                     CareTeamAssignmentRepository assignmentRepository) {
        this.queueEntryRepository = queueEntryRepository;
        this.staffUserRepository = staffUserRepository;
        this.assignmentRepository = assignmentRepository;
    }

    @Transactional(readOnly = true)
    public HospitalAllocationResponse currentAllocation() {
        Instant now = Instant.now();
        List<QueueEntry> entries = queueEntryRepository.findAll();
        List<CareTeamAssignment> assignments = assignmentRepository.findByActiveTrueOrderByAssignedAtDesc();
        List<BedAllocationResponse> beds = bedAllocations(entries, now);
        List<DoctorAllocationResponse> doctors = doctorAllocations(entries, assignments);
        long filledBeds = beds.stream().filter(BedAllocationResponse::filled).count();
        long filledDoctors = doctors.stream().filter(DoctorAllocationResponse::filled).count();
        return new HospitalAllocationResponse(
            new AllocationSummaryResponse(
                filledBeds,
                beds.size() - filledBeds,
                filledDoctors,
                doctors.size() - filledDoctors
            ),
            beds,
            doctors
        );
    }

    private List<BedAllocationResponse> bedAllocations(List<QueueEntry> entries, Instant now) {
        Map<String, List<QueueEntry>> inTreatmentByDepartment = new LinkedHashMap<>();
        departments(entries).forEach(department -> inTreatmentByDepartment.put(department, new ArrayList<>()));
        entries.stream()
            .filter(entry -> entry.getStatus() == QueueStatus.IN_TREATMENT)
            .sorted(Comparator.comparing(QueueEntry::getWaitingSince))
            .forEach(entry -> inTreatmentByDepartment
                .computeIfAbsent(entry.getDepartment(), ignored -> new ArrayList<>())
                .add(entry));

        List<BedAllocationResponse> beds = new ArrayList<>();
        inTreatmentByDepartment.forEach((department, departmentEntries) -> {
            int capacity = Math.max(DEFAULT_DEPARTMENT_BEDS, departmentEntries.size() + 2);
            for (int index = 0; index < capacity; index++) {
                QueueEntry entry = index < departmentEntries.size() ? departmentEntries.get(index) : null;
                beds.add(bedSlot(department, index + 1, entry, now));
            }
        });
        return beds;
    }

    private BedAllocationResponse bedSlot(String department, int slotNumber, QueueEntry entry, Instant now) {
        String label = department.substring(0, Math.min(3, department.length())).toUpperCase() + "-" + slotNumber;
        if (entry == null) {
            return new BedAllocationResponse(
                department + "-" + slotNumber,
                department,
                label,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                0
            );
        }
        return new BedAllocationResponse(
            entry.getId().toString(),
            department,
            label,
            true,
            entry.getPatient().getId().toString(),
            entry.getPatient().getDisplayId(),
            entry.getIntake().getId().toString(),
            entry.getIntake().getChiefComplaint(),
            entry.getUrgencyCategory(),
            entry.getStatus(),
            Math.max(0, Duration.between(entry.getWaitingSince(), now).toMinutes())
        );
    }

    private List<DoctorAllocationResponse> doctorAllocations(List<QueueEntry> entries, List<CareTeamAssignment> assignments) {
        Map<UUID, QueueEntry> entriesByPatient = new LinkedHashMap<>();
        entries.forEach(entry -> entriesByPatient.put(entry.getPatient().getId(), entry));
        Map<UUID, CareTeamAssignment> assignmentByDoctor = new LinkedHashMap<>();
        assignments.forEach(assignment -> assignmentByDoctor.putIfAbsent(assignment.getAssignedDoctor().getId(), assignment));

        return staffUserRepository.findByRoleAndActiveTrueOrderByCreatedAtAsc(StaffRole.DOCTOR).stream()
            .map(doctor -> doctorAllocation(doctor, assignmentByDoctor.get(doctor.getId()), entriesByPatient))
            .toList();
    }

    private DoctorAllocationResponse doctorAllocation(StaffUser doctor, CareTeamAssignment assignment,
                                                      Map<UUID, QueueEntry> entriesByPatient) {
        QueueEntry entry = assignment == null ? null : entriesByPatient.get(assignment.getPatient().getId());
        boolean filled = entry != null
            && entry.getStatus() != QueueStatus.DISCHARGED
            && entry.getStatus() != QueueStatus.LEFT_WITHOUT_BEING_SEEN;
        return new DoctorAllocationResponse(
            doctor.getId(),
            doctor.getStaffCode(),
            doctor.getDisplayName(),
            doctor.getDepartment(),
            doctor.getSpecialty(),
            filled,
            filled ? assignment.getPatient().getId().toString() : null,
            filled ? assignment.getPatient().getDisplayId() : null,
            filled ? entry.getStatus() : null,
            filled ? entry.getUrgencyCategory() : null,
            filled ? assignment.getAssignmentReason() : null,
            filled ? assignment.getAssignedAt() : null
        );
    }

    private Set<String> departments(List<QueueEntry> entries) {
        Set<String> departments = new LinkedHashSet<>(List.of("Emergency", "Pediatrics", "Orthopedics", "General"));
        entries.stream()
            .map(QueueEntry::getDepartment)
            .filter(department -> department != null && !department.isBlank())
            .forEach(departments::add);
        staffUserRepository.findByRoleAndActiveTrueOrderByCreatedAtAsc(StaffRole.DOCTOR).stream()
            .map(StaffUser::getDepartment)
            .filter(department -> department != null && !department.isBlank())
            .forEach(departments::add);
        return departments;
    }
}
