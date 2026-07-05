package com.careflowai.auth;

import com.careflowai.staff.StaffUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final Duration tokenTtl;

    public JwtService(@Value("${auth.jwt-secret}") String jwtSecret,
                      @Value("${auth.token-ttl-minutes:720}") long tokenTtlMinutes) {
        if (jwtSecret == null || jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET must be set and at least 32 bytes long.");
        }
        this.signingKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        this.tokenTtl = Duration.ofMinutes(tokenTtlMinutes);
    }

    public IssuedToken issue(StaffUser staffUser) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(tokenTtl);
        String token = Jwts.builder()
            .subject(staffUser.getId().toString())
            .claim("staffCode", staffUser.getStaffCode())
            .claim("role", staffUser.getRole().name())
            .claim("name", staffUser.getDisplayName())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiresAt))
            .signWith(signingKey)
            .compact();
        return new IssuedToken(token, expiresAt);
    }

    /** Returns the token claims, or throws io.jsonwebtoken.JwtException when invalid/expired. */
    public Claims parse(String token) {
        return Jwts.parser()
            .verifyWith(signingKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    public record IssuedToken(String token, Instant expiresAt) {
    }
}
