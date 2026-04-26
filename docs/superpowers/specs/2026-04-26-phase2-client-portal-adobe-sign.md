# Phase 2 — Client Portal, Adobe Sign, and Stripe Deposit — Design

Date: 2026-04-26
Status: Approved
Owner: jswilliamstu@gmail.com

## Context

Phase 1 built the internal quote machine. Phase 2 exposes those quotes to the client, handles the legal signature via Adobe Sign (replacing the original DocuSeal plan), and collects the initial deposit via Stripe.

## Goal

A client receives a secure link to their quote. They can review the pricing, ask questions (Phase 3), or click "Move Forward." Moving forward triggers a workflow: generate a PDF contract, send it to Adobe Sign for signature, and upon signature completion, redirect the client to a Stripe Checkout session to pay the deposit.

## Architecture

### Directory layout additions

```
src/
  app/
    portal/                         # NEW — client-facing, SSO-exempt
      [token]/
        page.tsx                    # Public quote view
        sign/route.ts               # Action: trigger Adobe Sign flow
        success/page.tsx            # Post-Stripe success page
  api/
    webhooks/
      adobe-sign/route.ts           # Adobe Sign webhook handler
      stripe/route.ts               # Stripe webhook handler
  lib/
    integrations/
      adobe-sign.ts                 # Adobe Sign API client
      stripe.ts                     # Stripe API client
      pdf.ts                        # PDF generation (@react-pdf/renderer)
```

### 1. Client Portal Access

- **Auth model:** Token-based. The `clients` table has a `portal_token` column. The URL is `https://contracts.dobeu.tech/portal/[token]`.
- **Security:** This route is explicitly added to `PUBLIC_PATH_PREFIXES` in `src/lib/supabase/middleware.ts` to bypass the admin login requirement.
- **View:** A read-only, branded version of the quote. Shows the project scope, line items, and total.

### 2. Adobe Sign Integration

- **Trigger:** Client clicks "Move Forward" on the portal page.
- **Action:**
  1. Server generates a PDF of the contract using `@react-pdf/renderer` (matching the quote details and agency settings).
  2. Server uploads the PDF to Adobe Sign via their REST API (`POST /transientDocuments`).
  3. Server creates an agreement (`POST /agreements`) with the client as the signer and a post-sign redirect URL pointing to our Stripe checkout handler.
  4. Server returns the Adobe Sign hosted signing URL.
  5. Client is redirected to Adobe Sign.
- **Webhook:** Adobe Sign pings `/api/webhooks/adobe-sign` when the document is signed. We download the signed PDF, upload it to Supabase Storage, and update the `contracts` table with `signed_at` and the `signed_pdf_url`.

### 3. Stripe Deposit Integration

- **Trigger:** Client completes the Adobe Sign flow and is redirected back to our app (e.g., `/portal/[token]/checkout`).
- **Action:**
  1. Server creates a Stripe Checkout Session for the deposit amount (calculated by the pricing engine).
  2. Client is redirected to Stripe to pay.
- **Webhook:** Stripe pings `/api/webhooks/stripe` on `checkout.session.completed`. We update the `invoices` table to mark the deposit as paid and notify the team.

## Data Flow

1. **Admin:** Creates quote, marks as "sent", copies portal link.
2. **Client:** Opens link, views quote.
3. **Client:** Clicks "Move Forward".
4. **System:** Generates PDF, creates Adobe Sign agreement, redirects client.
5. **Client:** Signs document on Adobe Sign.
6. **Adobe Sign:** Redirects client to Stripe Checkout URL (generated dynamically or via a bridging route).
7. **Client:** Pays deposit on Stripe.
8. **Stripe:** Redirects client to `/portal/[token]/success`.
9. **Webhooks:** Adobe Sign and Stripe webhooks asynchronously update the database (contracts and invoices tables).

## Error Handling

- If PDF generation fails, show a toast and log to Sentry.
- If Adobe Sign API fails, show a toast and log to Sentry.
- Webhooks must be idempotent. If a webhook fails, it should return a 500 so the provider retries.

## Next Steps

1. Implement the portal view.
2. Implement PDF generation.
3. Implement Adobe Sign API client and webhook.
4. Implement Stripe Checkout and webhook.
