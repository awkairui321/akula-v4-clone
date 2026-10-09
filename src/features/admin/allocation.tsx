import { Navigate, useParams } from "react-router-dom";

/** Allocation is a popup on the Subscriptions page; old links to the page open it there. */
export default function AllocationRedirect() {
  const { id } = useParams();
  return <Navigate to={`/luca/subscriptions?allocate=${id}`} replace />;
}
