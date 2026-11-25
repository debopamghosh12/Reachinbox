import DOMPurify from "dompurify";
import { ArrowLeft, CircleAlert, ExternalLink, MailX } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { useEmail } from "../features/emails/useEmails";
import { ApiError } from "../lib/api/client";
import { formatFullDate, formatShortDate } from "../lib/format";
import type { EmailDetail } from "../types/api";

export function EmailDetailPage() {
  const { id = "" } = useParams();
  const email = useEmail(id);
  const backTo = email.data?.status === "sent" || email.data?.status === "failed" ? "/dashboard/sent" : "/dashboard";

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-center gap-3 px-4 py-4">
        <Link to={backTo} aria-label="Back to list" className="rounded-full p-1.5 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-green-600">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl text-gray-900">
          {email.data ? email.data.subject : email.isPending ? <Skeleton className="h-6 w-72" /> : "Email"}
        </h1>
        {email.data && <StatusPill status={email.data.status} scheduledAt={email.data.scheduledAt} simulated={email.data.simulated} />}
      </header>

      <div className="mx-auto max-w-[1040px] px-6">
        {email.isPending && <DetailSkeleton />}
        {email.isError &&
          (email.error instanceof ApiError && email.error.status === 404 ? (
            <EmptyState icon={MailX} title="Email not found" description="It may have been deleted, or it belongs to another account." />
          ) : (
            <EmptyState
              tone="error"
              icon={CircleAlert}
              title="Couldn't load this email"
              description={email.error.message}
              action={<Button variant="outline" size="sm" onClick={() => void email.refetch()}>Retry</Button>}
            />
          ))}
        {email.data && <DetailBody email={email.data} />}
      </div>
    </div>
  );
}

function DetailBody({ email }: { email: EmailDetail }) {
  // The server already sanitized the HTML when it was scheduled. Sanitizing
  // again right before rendering means the page stays safe even if the API
  // ever returned something unexpected.
  const html = useMemo(() => (email.bodyFormat === "html" ? DOMPurify.sanitize(email.body) : null), [email.body, email.bodyFormat]);
  const when = email.sentAt ?? email.scheduledAt;

  return (
    <article className="flex gap-3 pt-2">
      <Avatar name={email.senderName} className="h-10 w-10 text-base" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-gray-900">{email.senderName}</span>
          <span className="text-xs text-gray-500">&lt;{email.senderEmail}&gt;</span>
          <time dateTime={when} title={formatFullDate(when)} className="ml-auto text-xs text-gray-500">
            {email.sentAt ? formatShortDate(email.sentAt) : `Scheduled for ${formatShortDate(email.scheduledAt)}`}
          </time>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">to {email.toEmail}</p>

        {email.status === "failed" && email.error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Sending failed: {email.error}
          </p>
        )}

        {html !== null ? (
          <div className="rich-text mt-5 text-sm text-gray-900" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="mt-5 text-sm whitespace-pre-wrap text-gray-900">{email.body}</p>
        )}

        {email.status === "sent" && email.simulated ? (
          <p className="mt-8 text-sm text-gray-500">
            Delivery was simulated (SMTP is blocked on this hosting plan), so there is no Ethereal copy.
          </p>
        ) : email.previewUrl && (
          <a
            href={email.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-green-700 hover:underline focus-visible:outline-2 focus-visible:outline-green-600"
          >
            View the delivered copy on Ethereal
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex gap-3 pt-2" aria-busy="true" aria-label="Loading email">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-6 h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
