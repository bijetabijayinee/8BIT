package com.careflowai.intake;

import com.careflowai.intake.dto.RiskFlagsDto;
import com.careflowai.intake.dto.VitalsDto;
import org.springframework.stereotype.Component;

@Component
public class IntakeMapper {

    public Vitals toVitals(VitalsDto dto) {
        Vitals vitals = new Vitals();
        if (dto == null) {
            return vitals;
        }
        vitals.setAge(dto.age());
        vitals.setHeightCm(dto.heightCm());
        vitals.setWeightKg(dto.weightKg());
        vitals.setTemperatureC(dto.temperatureC());
        vitals.setHeartRate(dto.heartRate());
        vitals.setSystolicPressure(dto.systolicPressure());
        vitals.setDiastolicPressure(dto.diastolicPressure());
        vitals.setRespiratoryRate(dto.respiratoryRate());
        vitals.setOxygenSaturation(dto.oxygenSaturation());
        return vitals;
    }

    public RiskFlags toRiskFlags(RiskFlagsDto dto) {
        RiskFlags flags = new RiskFlags();
        if (dto == null) {
            return flags;
        }
        flags.setChestPain(dto.chestPain());
        flags.setBreathingDifficulty(dto.breathingDifficulty());
        flags.setAlteredMentalState(dto.alteredMentalState());
        flags.setSevereBleeding(dto.severeBleeding());
        flags.setPregnancy(dto.pregnancy());
        flags.setPediatricRisk(dto.pediatricRisk());
        flags.setFallOrTrauma(dto.fallOrTrauma());
        flags.setImmunocompromised(dto.immunocompromised());
        return flags;
    }
}
