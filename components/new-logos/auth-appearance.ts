// components/new-logos/auth-appearance.ts — the existing sign-in, dressed neutrally for New Logos.
//
// The account system is the existing one (Clerk): same accounts, same sessions, no second sign-up. Only how it looks
// changes here. The site-wide provider styles these forms in the site's colours and typeface; each key it sets is
// replaced below (a component's appearance overrides the provider's key by key), the header that would name the
// application is hidden (this page says "Sign in" itself), and no logo is shown.

export const neutralAppearance = {
  variables: {
    colorPrimary: '#161616',
    colorText: '#161616',
    colorTextSecondary: '#5f5f5f',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#161616',
    colorDanger: '#8a1c1c',
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontFamilyButtons: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: '14px',
    borderRadius: '3px',
  },
  layout: {
    logoPlacement: 'none' as const,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
    shimmer: false,
  },
  elements: {
    rootBox: 'nl-auth-root',
    cardBox: 'nl-auth-card',
    card: 'nl-auth-card',
    header: 'nl-auth-hidden',
    headerTitle: 'nl-auth-hidden',
    headerSubtitle: 'nl-auth-hidden',
    logoBox: 'nl-auth-hidden',
    socialButtonsBlockButton: 'nl-auth-social',
    socialButtonsBlockButtonText: '',
    dividerLine: '',
    dividerText: '',
    formFieldLabel: '',
    formFieldInput: 'nl-auth-field',
    formButtonPrimary: 'nl-auth-primary',
    formButtonReset: '',
    footerActionText: '',
    footerActionLink: 'nl-auth-link',
    identityPreviewText: '',
    identityPreviewEditButton: 'nl-auth-link',
    otpCodeFieldInput: 'nl-auth-field',
    formResendCodeLink: 'nl-auth-link',
    alert: '',
    badge: '',
  },
};
