/**
 * Design system of the Astro DevTools panels: the Preact primitives shared by
 * every panel, themed by ./theme.css. Everything here is presentational —
 * data fetching and host integration stay with the consumer.
 */

/* Panel scaffolding and cards. */
export { PanelContent, PanelViewport } from "./PanelLayout.tsx";
export { CardTitle, PanelCard } from "./PanelCard.tsx";
export { CardButton } from "./CardButton.tsx";
export { CardLink } from "./CardLink.tsx";
export { SourceFileCard } from "./SourceFileCard.tsx";
export { Row, RowList } from "./RowList.tsx";

/* Controls and labels. */
export { Button } from "./Button.tsx";
export { Chip } from "./Chip.tsx";
export { DisclosureButton } from "./DisclosureButton.tsx";
export { TextInput } from "./TextInput.tsx";
export { Select } from "./Select.tsx";
export { TextArea } from "./TextArea.tsx";
export type { BadgeTone } from "./Badge.tsx";
export { Badge } from "./Badge.tsx";
export { Caption } from "./Caption.tsx";
export { SourceLink } from "./SourceLink.tsx";
export { ExternalLink } from "./ExternalLink.tsx";
export { DocsLink } from "./DocsLink.tsx";

/* Request lifecycle, empty states, and live announcements. */
export type { RequestResult, RequestState } from "./RequestNotes.tsx";
export { RequestNotes } from "./RequestNotes.tsx";
export { StateNote } from "./StateNote.tsx";
export { StatusAnnouncer } from "./StatusAnnouncer.tsx";

/* Icons. */
export type { IconComponent } from "./icons.tsx";
export {
  AstroLogoIcon,
  BugIcon,
  FunctionIcon,
  PreactLogoIcon,
  ReactLogoIcon,
  SitemapIcon,
  SolidLogoIcon,
  StarIcon,
  SvelteLogoIcon,
  ViteLogoIcon,
  VueLogoIcon,
} from "./icons.tsx";
