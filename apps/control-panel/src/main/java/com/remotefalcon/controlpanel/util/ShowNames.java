package com.remotefalcon.controlpanel.util;

import java.util.regex.Pattern;

/**
 * Show name rules (#217). The show subdomain is the name with whitespace
 * removed, lowercased, and it becomes a hostname label
 * ({@code <subdomain>.remotefalcon.com}). So a name may hold only letters,
 * digits, spaces and hyphens, and its subdomain must be a valid DNS label:
 * 1-63 characters, not starting or ending with a hyphen.
 *
 * <p>Applied on sign-up and whenever the name changes. Existing shows whose
 * names predate the rule are left alone until their owner renames them.
 */
public final class ShowNames {

    /** Error code the UI matches on. */
    public static final String INVALID_SHOW_NAME = "INVALID_SHOW_NAME";

    private static final Pattern ALLOWED = Pattern.compile("^[A-Za-z0-9 -]+$");
    private static final Pattern DNS_LABEL = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$");

    private ShowNames() {
    }

    public static String subdomainFor(String showName) {
        return showName.replaceAll("\\s", "").toLowerCase();
    }

    public static boolean isValid(String showName) {
        return showName != null
                && ALLOWED.matcher(showName).matches()
                && DNS_LABEL.matcher(subdomainFor(showName)).matches();
    }
}
