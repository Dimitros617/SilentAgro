/** Jak dlouho platí odkaz z ověřovacího e-mailu. */
export const VERIFICATION_TTL_HOURS = 48

export const verificationExpiry = (now: Date): Date =>
  new Date(now.getTime() + VERIFICATION_TTL_HOURS * 3600 * 1000)
