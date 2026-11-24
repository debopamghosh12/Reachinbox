import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/Button";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Gmail-style "1–20 of 785  ‹ ›".
export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
      <span className="mr-1 tabular-nums" aria-live="polite">
        {first}–{last} of {total}
      </span>
      <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next page" disabled={last >= total} onClick={() => onPageChange(page + 1)}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
