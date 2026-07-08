package com.careflowai.intake.dto;

import java.math.BigDecimal;

public record VitalsDto(
    Integer age,
    BigDecimal heightCm,
    BigDecimal weightKg,
    BigDecimal temperatureC,
    Integer heartRate,
    Integer systolicPressure,
    Integer diastolicPressure,
    Integer respiratoryRate,
    Integer oxygenSaturation
) {
}
