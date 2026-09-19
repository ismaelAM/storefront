export const POLICY_LINKS = [
  {
    name: "Shipping Policy",
    nameKey: "shippingPolicy",
    slug: "shipping-policy",
  },
  { name: "Privacy Policy", nameKey: "privacyPolicy", slug: "privacy-policy" },
  { name: "Returns Policy", nameKey: "returnsPolicy", slug: "returns-policy" },
  {
    name: "Terms of Service",
    nameKey: "termsOfService",
    slug: "terms-of-service",
  },
];

/** Policies shown in the consent checkbox (checkout + registration). */
export const CONSENT_POLICIES = [
  {
    name: "Terms of Service",
    nameKey: "termsOfService",
    slug: "terms-of-service",
  },
];
// The privacy policy is a transparency notice, not a blanket consent.
// Optional processing (marketing, non-essential cookies, etc.) must request
// its own specific consent where required.
