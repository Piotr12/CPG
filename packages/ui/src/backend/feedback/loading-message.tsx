import { Skeleton } from "../../components/skeleton";

/** A language-neutral page shell while request-time content streams into a Suspense boundary. */
export function LoadingMessage() {
  return (
    <div aria-busy="true" className="flex min-h-40 flex-col gap-6">
      <Skeleton aria-hidden="true" className="h-8 w-2/3 max-w-sm" />
      <Skeleton aria-hidden="true" className="h-4 w-full" />
      <Skeleton aria-hidden="true" className="h-32 w-full" />
    </div>
  );
}
