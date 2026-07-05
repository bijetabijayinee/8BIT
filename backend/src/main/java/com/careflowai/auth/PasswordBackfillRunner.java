package com.careflowai.auth;

import com.careflowai.staff.StaffUser;
import com.careflowai.staff.StaffUserRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gives every staff user without a password the default one (bcrypt-hashed) so the
 * whole seeded directory can log in individually. Runs at startup and is idempotent;
 * the default is configurable via DEFAULT_STAFF_PASSWORD.
 */
@Component
public class PasswordBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PasswordBackfillRunner.class);

    private final StaffUserRepository staffUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final String defaultPassword;

    public PasswordBackfillRunner(StaffUserRepository staffUserRepository,
                                  PasswordEncoder passwordEncoder,
                                  @Value("${auth.default-staff-password:careflow}") String defaultPassword) {
        this.staffUserRepository = staffUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.defaultPassword = defaultPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<StaffUser> missingPassword = staffUserRepository.findByPasswordHashIsNull();
        if (missingPassword.isEmpty()) {
            return;
        }
        String hash = passwordEncoder.encode(defaultPassword);
        missingPassword.forEach(staffUser -> staffUser.setPasswordHash(hash));
        staffUserRepository.saveAll(missingPassword);
        log.info("Backfilled default password for {} staff user(s).", missingPassword.size());
    }
}
