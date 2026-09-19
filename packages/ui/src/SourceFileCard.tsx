import { CardTitle, PanelCard } from "./PanelCard.tsx";
import { SourceLink } from "./SourceLink.tsx";

/** A card that titles one source file and opens it on click. */
export function SourceFileCard({
  title,
  file,
  onOpen,
}: {
  title: string;
  file: string;
  onOpen: () => void;
}) {
  return (
    <PanelCard>
      <CardTitle>{title}</CardTitle>
      <SourceLink class="block max-w-full truncate font-mono" title={file} onClick={onOpen}>
        {file}
      </SourceLink>
    </PanelCard>
  );
}
