import type { ReactNode } from "react";
import { Link } from "react-router";

// Public page (no login): Google's OAuth consent screen links here.
const REPO_URL = "https://github.com/debopamghosh12/Reachinbox";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-[#1C1C1C]">{title}</h2>
      <div className="text-sm leading-6 text-gray-600">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-[640px] rounded-2xl border border-line px-6 py-12 sm:px-14">
        <h1 className="mb-2 text-center text-[32px] font-semibold text-[#1C1C1C]">Privacy Policy</h1>
        <p className="mb-8 text-center text-xs text-[#AFAFAF]">Last updated: 25 November 2026</p>

        <div className="flex flex-col gap-6">
          <Section title="About this app">
            ONB Outbox is a demo email scheduler built for a coding assignment. It is not a commercial service.
          </Section>

          <Section title="Google sign-in">
            If you sign in with Google, the app receives only your <strong>name</strong>, <strong>email address</strong> and{" "}
            <strong>profile picture</strong>. They are used solely to identify you in the app. No other Google data is
            requested or accessed.
          </Section>

          <Section title="Emails you schedule">
            Emails are sent through <strong>Ethereal</strong>, a fake SMTP service for testing. Messages are captured by
            Ethereal and <strong>never reach real inboxes</strong>.
          </Section>

          <Section title="Slack">
            If you connect Slack, the app stores only the <strong>incoming-webhook URL</strong> for the channel you pick. It
            is used only to post rate-limit alerts there.
          </Section>

          <Section title="Sharing">
            Your data is <strong>not sold or shared</strong> with anyone.
          </Section>

          <Section title="Deleting your data">
            To have your account and data deleted, contact the repository owner on{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-green-600 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-600"
            >
              GitHub
            </a>
            .
          </Section>
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          <Link
            to="/login"
            className="font-medium text-green-600 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-600"
          >
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
