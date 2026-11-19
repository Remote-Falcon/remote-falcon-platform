package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class ShowNamesTest {

    @Test
    void subdomainFor_dropsWhitespaceAndLowercases() {
        assertThat(ShowNames.subdomainFor("Holtz Family Lights")).isEqualTo("holtzfamilylights");
        assertThat(ShowNames.subdomainFor("Barrington-NJ Lights")).isEqualTo("barrington-njlights");
    }

    @ParameterizedTest
    @ValueSource(strings = {"My Show", "Lights123", "x-lights", "Barrington-NJ Lights", "A", "a b c"})
    void isValid_acceptsLettersNumbersSpacesAndHyphens(String name) {
        assertThat(ShowNames.isValid(name)).isTrue();
    }

    // #217: anything a hostname can't carry is rejected.
    @ParameterizedTest
    @ValueSource(strings = {
            "Matty's Lights", "walltown.remotefalcon", "casa22/07/2025", "Lights!", "Show_Name",
            "Café Lights", "a@b", "x#y", "q?r", "percent%20", "-leading", "trailing-", " - ", "   "})
    void isValid_rejectsCharactersAHostnameCannotCarry(String name) {
        assertThat(ShowNames.isValid(name)).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    void isValid_rejectsNullAndEmpty(String name) {
        assertThat(ShowNames.isValid(name)).isFalse();
    }

    @Test
    void isValid_capsTheSubdomainAtTheDnsLabelLimit() {
        assertThat(ShowNames.isValid("a".repeat(63))).isTrue();
        assertThat(ShowNames.isValid("a".repeat(64))).isFalse();
        // Spaces don't count: they are removed from the subdomain.
        assertThat(ShowNames.isValid("a".repeat(30) + "   " + "b".repeat(33))).isTrue();
    }
}
