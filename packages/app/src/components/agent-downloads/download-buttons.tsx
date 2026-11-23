import { Download } from "lucide-react";
import { Button } from "@cpg/ui/components/button";
import { DOWNLOADS_PATH, SKILL_ARCHIVE_NAME } from "../../agent-downloads/downloads";

interface DownloadButtonsProps {
  /** The package archive's current name, `cpg-mcp-{hash}.zip`. */
  mcpFileName: string;
  labels: { downloadMcp: string; downloadSkill: string };
}

/** The two agent downloads (#398), on the homepage and in the `/agents` guide: plain links, no script. */
export function DownloadButtons({ mcpFileName, labels }: DownloadButtonsProps) {
  const links = [
    { kind: "mcp", href: `${DOWNLOADS_PATH}/${mcpFileName}`, label: labels.downloadMcp },
    { kind: "skill", href: `${DOWNLOADS_PATH}/${SKILL_ARCHIVE_NAME}`, label: labels.downloadSkill },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ kind, href, label }) => (
        <Button key={kind} asChild variant="outline">
          <a href={href} download data-download={kind}>
            <Download aria-hidden />
            {label}
          </a>
        </Button>
      ))}
    </div>
  );
}
