import { Button } from "./Button.tsx";
import { StateNote } from "./StateNote.tsx";
import { StatusAnnouncer } from "./StatusAnnouncer.tsx";

/**
 * The lifecycle of one data request, as rendered by `RequestNotes`. `data`
 * stays available during refreshes and transient failures so a consumer can
 * keep showing the previous result.
 */
export type RequestState<Data> =
  | { status: "loading"; data: Data | undefined; error: undefined }
  | { status: "ready"; data: Data; error: undefined }
  | { status: "error"; data: Data | undefined; error: Error };

/** A request state plus the handle that starts the request over. */
export type RequestResult<Data> = RequestState<Data> & { refresh: () => void };

/**
 * Render the loading and error notes for one data request. Previous data
 * marks the notes as stale refreshes; a ready request keeps only the empty
 * live region that will announce the next refresh.
 */
export function RequestNotes({ state, label }: { state: RequestResult<unknown>; label: string }) {
  const stale = state.data !== undefined;
  const loadingTitle = `${stale ? "Refreshing" : "Loading"} ${label}…`;
  const announcement = state.status === "loading" ? loadingTitle : "";

  if (state.status === "loading") {
    return (
      <>
        <StatusAnnouncer>{announcement}</StatusAnnouncer>
        <StateNote title={loadingTitle}>
          {stale
            ? "Showing previously loaded data while waiting."
            : "Waiting for the dev server to respond."}
        </StateNote>
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        <StatusAnnouncer>{announcement}</StatusAnnouncer>
        <div role="alert" class="rounded-md border border-[#ff7878]/30 bg-[#ff7878]/8 p-3">
          <StateNote
            class="wrap-anywhere"
            title={`${stale ? "Could not refresh" : "Could not load"} ${label}.`}
          >
            {state.error.message}
            {stale && " Showing previously loaded data."}
          </StateNote>
          <Button class="mt-3" onClick={state.refresh}>
            Retry
          </Button>
        </div>
      </>
    );
  }
  return <StatusAnnouncer>{announcement}</StatusAnnouncer>;
}
