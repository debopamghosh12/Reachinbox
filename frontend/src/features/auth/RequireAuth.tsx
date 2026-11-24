import { CircleAlert } from "lucide-react";
import { Navigate, Outlet } from "react-router";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { useMe } from "./useAuth";

// Wraps every page that needs a login. /api/me decides:
//   loading -> spinner
//   null (logged out, a 401) -> redirect to /login once
//   other error (API down...) -> retry screen
//   a user -> the page
// Every data query (lists, counts, polling) lives in the pages below, so
// nothing else runs while logged out.
export function RequireAuth() {
  const me = useMe();

  if (me.isPending) return <PageSpinner />;
  if (me.isError) {
    return (
      <EmptyState
        tone="error"
        icon={CircleAlert}
        title="Couldn't load your account"
        description={me.error.message}
        action={<Button variant="outline" size="sm" onClick={() => void me.refetch()}>Retry</Button>}
      />
    );
  }
  if (me.data === null) return <Navigate to="/login" replace />;
  return <Outlet />;
}
