package com.careflowai.auth;

import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserRepository;
import com.careflowai.staff.dto.StaffUserResponse;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final StaffUserRepository staffUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthController(StaffUserRepository staffUserRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService) {
        this.staffUserRepository = staffUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public record LoginRequest(@NotBlank String staffCode, @NotBlank String password) {
    }

    public record AuthResponse(String token, Instant expiresAt, StaffUserResponse staff) {
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest request) {
        StaffUser staffUser = staffUserRepository.findByStaffCodeIgnoreCase(request.staffCode().trim())
            .filter(StaffUser::isActive)
            .orElseThrow(AuthController::badCredentials);
        if (staffUser.getPasswordHash() == null
                || !passwordEncoder.matches(request.password(), staffUser.getPasswordHash())) {
            throw badCredentials();
        }
        JwtService.IssuedToken issued = jwtService.issue(staffUser);
        return new AuthResponse(issued.token(), issued.expiresAt(), StaffUserResponse.from(staffUser));
    }

    @GetMapping("/me")
    public StaffUserResponse me(@AuthenticationPrincipal StaffUser staffUser) {
        if (staffUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated.");
        }
        return StaffUserResponse.from(staffUser);
    }

    private static ResponseStatusException badCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid staff code or password.");
    }
}
