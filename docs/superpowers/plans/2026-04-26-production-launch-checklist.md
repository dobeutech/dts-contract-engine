# Production Launch Checklist — DTS Contract Engine

Date: 2026-04-26
Owner: jswilliamstu@gmail.com

This document consolidates the launch requirements for taking the DTS Contract Engine from its current bootstrap shell to a fully operational product at `contracts.dobeu.tech`. It covers the execution of Phase 1 (Quote Machine), Phase 2 (Adobe Sign + Stripe), and Phase 3 (Intercom Fin).

## 1. Implementation Sequence

The implementation must follow a strict vertical-slice order to ensure the foundation is stable before adding external integrations.

### Slice 1: The Quote Machine (Phase 1)

- [ ] Implement `ActionResult` envelope and base types.
- [ ] Implement Zod schemas for `ClientInput` and `PricingConfig`.
- [ ] Build the pricing-config admin JSON editor and atomic publish RPC.
- [ ] Build the Clients CRUD UI.
- [ ] Build the Quote Builder UI (live calculation, draft saving).
- [ ] Implement quote status transitions (draft → sent → lost/void).
- [ ] Implement the two-stage audit log write.
- [ ] **Checkpoint:** Verify all tests pass, including RLS assertions.

### Slice 2: The Client Portal & Adobe Sign (Phase 2)

- [ ] Build the public, token-gated portal view (`/portal/[token]`).
- [ ] Implement PDF generation using `@react-pdf/renderer`.
- [ ] Integrate Adobe Sign API (`POST /transientDocuments`, `POST /agreements`).
- [ ] Implement the Adobe Sign webhook handler to capture the signed PDF.
- [ ] **Checkpoint:** Verify a test quote can be viewed, signed, and the signed PDF is saved to Supabase Storage.

### Slice 3: Stripe Deposit & Intercom Fin (Phase 3)

- [ ] Integrate Stripe Checkout for the deposit amount.
- [ ] Implement the Stripe webhook handler to mark the invoice as paid.
- [ ] Add the Intercom Messenger to the portal layout.
- [ ] Implement the custom "Ask a Question" launcher.
- [ ] Configure Fin in the Intercom dashboard.
- [ ] Add Resend email notification to the Stripe webhook handler.
- [ ] **Checkpoint:** Verify the full end-to-end flow: Quote → Portal → Sign → Pay → Notification.

## 2. Pre-Launch Verification

Before removing the Vercel SSO protection and allowing real clients to access the portal, verify the following:

### Security & Environment

- [ ] All credentials rotated (Vercel PAT, Supabase PAT, Supabase service-role key).
- [ ] Vercel environment variables populated for production:
  - `ADOBE_SIGN_API_KEY`, `ADOBE_SIGN_WEBHOOK_SECRET`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `RESEND_API_KEY`
  - `NEXT_PUBLIC_INTERCOM_APP_ID`, `INTERCOM_ACCESS_TOKEN`
  - `CLIENT_PORTAL_JWT_SECRET`
- [ ] Supabase Auth URL configuration includes `https://contracts.dobeu.tech`.
- [ ] Webhook endpoints (`/api/webhooks/*`) are explicitly excluded from auth middleware.

### Quality & Performance

- [ ] `pnpm test` passes (unit/integration).
- [ ] `pnpm test:e2e` passes against the production URL.
- [ ] `pnpm build` succeeds with no warnings.
- [ ] Sentry is capturing errors (verify with a test throw).
- [ ] Dobeu Design System tokens are rendering correctly in dark mode.

## 3. Rollout Strategy

We will use a staged rollout to minimize risk.

1. **Internal Beta (SSO Enabled):**
   - Deploy to production.
   - Vercel SSO remains enabled (`all_except_custom_domains`).
   - Jeremy creates test quotes and runs through the full Adobe Sign + Stripe flow internally.
   - Monitor Sentry for unexpected errors.

2. **Soft Launch (First Client):**
   - Identify one low-risk client for the first real quote.
   - Generate the quote and send the portal link.
   - Monitor the Adobe Sign and Stripe webhooks closely during their interaction.

3. **Full Availability:**
   - Once the first client successfully signs and pays, the system is considered fully operational.

## 4. Monitoring & Rollback

### Key Metrics to Monitor

- **Error Rate:** Spike in Sentry errors, particularly in webhook handlers.
- **Webhook Failures:** Stripe or Adobe Sign reporting failed webhook deliveries.
- **Conversion Drop-off:** Clients opening the portal but failing to initiate the Adobe Sign flow.

### Rollback Triggers

- **Critical:** Adobe Sign API changes breaking the signature flow.
- **Critical:** Stripe Checkout failing to initialize.
- **Critical:** Webhooks failing to update the database, resulting in out-of-sync state.

### Rollback Procedure

If a critical issue occurs:

1. **Immediate Mitigation:** Instruct Jeremy to revert to manual PDF/Stripe invoicing.
2. **Code Revert:** `git revert <problematic-commit> && git push`.
3. **Database:** If data corruption occurred, manually correct the `contracts` or `invoices` tables using the Supabase SQL Editor. Do not attempt an automated down-migration.
