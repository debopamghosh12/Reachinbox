import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock, RotateCw, Search, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { EmailRow, EmailRowSkeleton } from "../features/emails/EmailRow";
import { Pagination } from "../features/emails/Pagination";
import { useEmailList } from "../features/emails/useEmails";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../lib/cn";
import { queryKeys } from "../lib/queryClient";
import type { ListTab } from "../types/api";

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 8;

const EMPTY = {
  scheduled: { icon: Clock, title: "No scheduled emails", description: "Emails you schedule stay here until they're sent." },
  sent: { icon: Send, title: "Nothing sent yet", description: "Sent emails show up here with a link to their Ethereal copy." },
};

// The Scheduled and Sent tabs. App.tsx renders it with key={tab}, so
// switching tabs starts with a fresh search and page 1.
export function EmailListPage({ tab }: { tab: ListTab }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const list = useEmailList({ tab, page, q });
  const queryClient = useQueryClient();

  // Refresh = refetch every email query: this list and the sidebar counts.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.emails });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 pb-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#A4ABB7]" aria-hidden />
          <label htmlFor="email-search" className="sr-only">Search {tab} emails</label>
          <input
            id="email-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // new search, new results
            }}
            placeholder="Search"
            className="h-9 w-full rounded-full bg-field pr-4 pl-10 text-sm text-gray-900 placeholder:text-[#A4ABB7] focus:outline-2 focus:outline-green-600"
          />
        </div>
        <Button variant="ghost" size="icon" aria-label="Refresh" onClick={refresh} disabled={list.isFetching}>
          <RotateCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} aria-hidden />
        </Button>
        {list.data && list.data.total > 0 && (
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPageChange={setPage} />
        )}
      </div>

      <ListBody tab={tab} q={q} list={list} />
    </div>
  );
}

function ListBody({ tab, q, list }: { tab: ListTab; q: string; list: ReturnType<typeof useEmailList> }) {
  if (list.isPending) {
    return (
      <ul aria-busy="true" aria-label="Loading emails">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <EmailRowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (list.isError) {
    return (
      <EmptyState
        tone="error"
        icon={CircleAlert}
        title="Couldn't load emails"
        description={list.error.message}
        action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}
      />
    );
  }

  if (list.data.items.length === 0) {
    if (q) return <EmptyState icon={Search} title={`No ${tab} emails match “${q}”`} description="Try a different word, or part of an address." />;
    const empty = EMPTY[tab];
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={<Link to="/compose" className={buttonClasses("outline", "sm")}>Compose</Link>}
      />
    );
  }

  return (
    // Fade (not hide) the old page while the next one loads.
    <ul aria-label={`${tab} emails`} className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
      {list.data.items.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
    </ul>
  );
}
