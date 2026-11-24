import { CircleAlert } from "lucide-react";
import { Navigate, Outlet } from "react-router";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { isUnauthorized } from "../../lib/api/client";
import { useMe } from "./useAuth";

// Wraps every page that needs a login. /api/me decides:
//   loading -> spinner, 401 -> /login, other error -> retry screen, ok -> the page.
export function RequireAuth() {
  const me = useMe();

  if (me.isPending) return <PageSpinner />;
  if (me.isError) {
    if (isUnauthorized(me.error)) return <Navigate to="/login" replace />;
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
  return <Outlet />;
}
