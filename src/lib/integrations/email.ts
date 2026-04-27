import "server-only";
import { Resend } from "resend";
import { formatCents } from "@/lib/pricing/engine";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

interface KickoffArgs {
  client: {
    company?: string;
    email?: string | null;
    contact_name?: string | null;
  };
  quote: {
    id: string;
    project_name?: string | null;
    project_type?: string | null;
    contract_pdf_url?: string | null;
    calc?: {
      firstMonthTotalCents?: number;
      depositAmountCents?: number;
    } | null;
  };
  amountPaidCents: number;
}

const FROM =
  process.env.NOTIFICATIONS_FROM_EMAIL ??
  "dobeu contracts <contracts@dobeu.tech>";
const TEAM = process.env.NOTIFICATIONS_TEAM_EMAIL ?? "jeremyw@dobeu.net";

export async function sendKickoffNotification(
  args: KickoffArgs,
): Promise<void> {
  const r = getResend();
  if (!r) return;

  const subject = `New signed engagement: ${args.client.company ?? "client"} — ${args.quote.project_name ?? args.quote.project_type ?? "project"}`;
  const lines = [
    `${args.client.company ?? "Client"} just paid ${formatCents(args.amountPaidCents)}.`,
    "",
    `Project: ${args.quote.project_name ?? args.quote.project_type ?? "n/a"}`,
    `Quote ID: ${args.quote.id}`,
    "",
    "The signed contract is in the admin app under Quotes. Reach out within one business day to schedule kickoff.",
  ];

  try {
    await r.emails.send({
      from: FROM,
      to: TEAM,
      subject,
      text: lines.join("\n"),
    });
  } catch (e) {
    console.error(
      "[email] kickoff notify failed",
      e instanceof Error ? e.message : e,
    );
  }

  if (args.client.email) {
    try {
      await r.emails.send({
        from: FROM,
        to: args.client.email,
        subject: `Welcome to dobeu — kickoff for ${args.quote.project_name ?? "your project"}`,
        text: [
          `Hi ${args.client.contact_name ?? args.client.company ?? "there"},`,
          "",
          "Thanks for signing and paying the deposit. Jeremy will reach out within one business day to schedule kickoff.",
          "",
          "Your signed agreement is available from the portal link we sent earlier.",
          "",
          "— dobeu",
        ].join("\n"),
      });
    } catch (e) {
      console.error(
        "[email] client kickoff confirm failed",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

interface QuestionArgs {
  client: {
    company: string;
    email: string | null;
    contact_name: string | null;
  };
  quote: { id: string; project_name: string | null; project_type: string };
  message: string;
}

export async function sendQuestionNotification(
  args: QuestionArgs,
): Promise<void> {
  const r = getResend();
  if (!r) return;
  const subject = `[dobeu portal Q] ${args.client.company} — ${args.quote.project_name ?? args.quote.project_type}`;
  try {
    await r.emails.send({
      from: FROM,
      to: TEAM,
      replyTo: args.client.email ?? undefined,
      subject,
      text: [
        `${args.client.contact_name ?? args.client.company} (${args.client.email ?? "no email"}) asked:`,
        "",
        args.message,
        "",
        `Quote: ${args.quote.id}`,
      ].join("\n"),
    });
  } catch (e) {
    console.error(
      "[email] question notify failed",
      e instanceof Error ? e.message : e,
    );
  }
}
