/** The password rules and session lifetime, kept apart from the server-only
 *  auth modules so the Account page can state the same numbers they enforce. */

export const MIN_PASSWORD_LENGTH = 12;

/** Days without a visit before a browser is signed out. */
export const SESSION_IDLE_DAYS = 30;
