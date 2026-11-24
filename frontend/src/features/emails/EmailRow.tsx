import { ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusPill } from "../../components/ui/StatusPill";
import type { EmailListItem } from "../../types/api";

// One list row. The whole row opens the email: an invisible link covers it,
// and the Ethereal link sits above that (z-10), so the two links aren't
// nested (nested <a> tags are invalid HTML).
export function EmailRow({ email }: { email: EmailListItem }) {
  return (
    <li className="relative flex h-14 items-center gap-4 border-b border-gray-100 px-4 hover:bg-gray-50">
      <Link
        to={`/emails/${email.id}`}
        aria-label={`Open email to ${email.toEmail}: ${email.subject}`}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-600"
      />
      <span className="w-48 shrink-0 truncate text-sm text-gray-900" title={email.toEmail}>
        To: {email.toEmail}
      </span>
      <StatusPill status={email.status} scheduledAt={email.scheduledAt} error={email.error} />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold text-gray-900">{email.subject}</span>
        {email.bodyPreview && <span className="text-gray-400"> - {email.bodyPreview}</span>}
      </p>
      {email.previewUrl && (
        <a
          href={email.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded text-xs text-gray-500 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-600"
        >
          Preview
          <ExternalLink className="h-3 w-3" aria-hidden />
          <span className="sr-only">(opens the Ethereal copy in a new tab)</span>
        </a>
      )}
    </li>
  );
}

export function EmailRowSkeleton() {
  return (
    <li className="flex h-14 items-center gap-4 border-b border-gray-100 px-4" aria-hidden>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-3 flex-1" />
    </li>
  );
}
