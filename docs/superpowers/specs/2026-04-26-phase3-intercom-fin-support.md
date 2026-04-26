# Phase 3 — Intercom Fin Support — Design

Date: 2026-04-26
Status: Approved
Owner: jswilliamstu@gmail.com

## Context

Phase 2 built the client portal, Adobe Sign integration, and Stripe deposit flow. Phase 3 adds the ability for clients to ask questions about their quote directly from the portal using Intercom Fin, and notifies Jeremy when a quote is signed and paid.

## Goal

A client viewing their quote in the portal can click "Ask a Question" to open an Intercom chat. Fin (Intercom's AI bot) will attempt to answer basic questions based on the quote context. If Fin cannot answer, it will create a ticket for Jeremy. Jeremy is also notified when a client completes the signature and payment flow.

## Architecture

### Directory layout additions

```
src/
  components/
    intercom/
      provider.tsx                  # Intercom React provider
      launcher.tsx                  # Custom "Ask a Question" button
  lib/
    integrations/
      intercom.ts                   # Intercom API client (server-side)
```

### 1. Intercom Fin Integration

- **Client-side:** The portal page (`/portal/[token]/page.tsx`) will include the Intercom Messenger.
- **Trigger:** A custom "Ask a Question" button on the quote page will open the Intercom Messenger using the Intercom JS API (`Intercom('show')`).
- **Context:** When initializing Intercom, we will pass the client's email, company name, and the quote ID as custom attributes so Fin has context.
- **Fin:** Fin will be configured in the Intercom dashboard to handle initial inquiries. If it cannot resolve the issue, it will route the conversation to the team inbox (Jeremy).

### 2. Completion Notifications

- **Trigger:** The Stripe webhook (`checkout.session.completed`) fires after the deposit is paid.
- **Action:** The server will send a notification to Jeremy.
- **Implementation:** Since we are already using Intercom, we can use the Intercom API to send an internal note or create a conversation in the team inbox, or we can use Resend to send a simple email notification to `jeremyw@dobeu.net`.
- **Decision:** Use Resend for a direct email notification to Jeremy. It's simpler and ensures he gets an immediate alert outside of the support queue.

## Data Flow

1. **Client:** Views quote in portal.
2. **Client:** Clicks "Ask a Question".
3. **Intercom:** Messenger opens. Client chats with Fin.
4. **Fin:** Answers or routes to Jeremy.
5. **Client:** Completes Adobe Sign and Stripe flow.
6. **Stripe Webhook:** Fires.
7. **System:** Sends email to Jeremy via Resend: "Quote [ID] signed and deposit paid by [Company]."

## Error Handling

- If Intercom fails to load on the client, the "Ask a Question" button should gracefully degrade (e.g., mailto link).
- If Resend fails to send the notification, log to Sentry. The database state (contracts, invoices) is the source of truth.

## Next Steps

1. Add Intercom script to the portal layout.
2. Implement the custom launcher button.
3. Configure Fin in the Intercom dashboard.
4. Add Resend notification logic to the Stripe webhook handler.
