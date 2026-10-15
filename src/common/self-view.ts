/**
 * Marks an object as the caller's own view when the session cookie was only
 * just issued (register/login) and is not yet present on the request. Private
 * fields (User.email, Club.managedBy...) check it besides the request session.
 */
export const SELF_VIEW = Symbol("selfView");
