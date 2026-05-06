package com.remotefalcon.testfixtures;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import net.datafaker.Faker;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Object Mother + Builder for {@link Show}.
 *
 * <p>Sprint 1 PR A populates only the minimum required top-level identity and
 * lifecycle fields. Nested objects (preferences, stats, sequences, requests,
 * votes, pages, etc.) are intentionally left null — Sprint 2 will add dedicated
 * factories per nested type.
 *
 * <p>Note: {@link Show} declares {@code @Builder} but not {@code toBuilder = true},
 * so {@link #builder()} returns a freshly-seeded builder rather than re-wrapping
 * an existing instance. Both {@link #canonical()} and {@link #builder()} share
 * the same seed values via {@link #seed()}.
 */
public final class ShowFactory {

    private static final Faker FAKER = new Faker();

    private ShowFactory() {}

    /** Returns a fresh canonical Show with all required identity fields populated. */
    public static Show canonical() {
        return seed().build();
    }

    /**
     * Returns a builder pre-seeded with canonical values for chained customization.
     *
     * <p>Callers can override any field, e.g.
     * {@code ShowFactory.builder().email("alice@example.com").build()}.
     */
    public static Show.ShowBuilder builder() {
        return seed();
    }

    private static Show.ShowBuilder seed() {
        String showName = FAKER.team().name() + " Light Show";
        String subdomain = showName
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        LocalDateTime now = LocalDateTime.now();

        return Show.builder()
                .showToken(UUID.randomUUID().toString())
                .email(FAKER.internet().emailAddress())
                .password("$2a$10$test.bcrypt.hash.placeholder.value.for.fixtures.only.AAA")
                .showName(showName)
                .showSubdomain(subdomain)
                .emailVerified(true)
                .createdDate(now.minusDays(30))
                .lastLoginDate(now.minusHours(1))
                .expireDate(now.plusYears(1))
                .showRole(ShowRole.USER);
    }
}
