import { useState, useMemo } from "react";
import { useDownloadStore } from "../stores/downloadStore";
import type { MetadataResult } from "../types";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  upload_date: "Date",
  genre: "Genre",
  language: "Language",
  video_id: "Video ID",
  webpage_url: "Source URL",
  description: "Description",
  channel: "Channel",
  duration: "Duration",
};

const FIELD_PRIORITY = [
  "title", "artist", "album", "upload_date", "genre",
  "language", "video_id", "webpage_url", "description",
  "channel", "duration",
];

interface CheckEntry {
  label: string;
  key: string;
  present: boolean;
}

function buildChecklist(meta: MetadataResult): CheckEntry[] {
  const f = meta.fields;
  const v = meta.verify;
  return [
    { label: "Title", key: "title", present: v.title ?? !!f.title },
    { label: "Artist", key: "artist", present: v.artist ?? !!f.artist },
    { label: "Album", key: "album", present: !!f.album },
    { label: "Date", key: "upload_date", present: v.date ?? !!f.upload_date },
    { label: "Genre", key: "genre", present: !!f.genre },
    { label: "Language", key: "language", present: !!f.language },
    { label: "Video ID", key: "video_id", present: !!f.video_id },
    { label: "Comment", key: "comment", present: v.comment ?? !!f.webpage_url },
    { label: "Cover Art", key: "cover_art", present: meta.cover_art },
    { label: "Description", key: "description", present: !!f.description },
  ];
}

export function MetadataPanel() {
  const metadataResult = useDownloadStore((s) => s.metadataResult);
  const [descExpanded, setDescExpanded] = useState(false);

  const orderedFields = useMemo(() => {
    if (!metadataResult) return [];
    const entries: { label: string; value: string }[] = [];
    for (const key of FIELD_PRIORITY) {
      const val = metadataResult.fields[key];
      if (val) {
        entries.push({ label: FIELD_LABELS[key] || key, value: val });
      }
    }
    return entries;
  }, [metadataResult]);

  const checklist = useMemo(
    () => (metadataResult ? buildChecklist(metadataResult) : []),
    [metadataResult],
  );

  const verifiedCount = useMemo(
    () => checklist.filter((c) => c.present).length,
    [checklist],
  );

  const totalCount = checklist.length;
  const allVerified = verifiedCount === totalCount;
  const missingFields = checklist.filter((c) => !c.present);

  if (!metadataResult) return null;

  return (
    <section
      className="card overflow-hidden"
      style={{ animation: "fade-in-up 0.35s ease-out" }}
    >
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-success text-base">●</span>
            <h2 className="eyebrow">Metadata Embedded</h2>
          </div>
          <span className="text-xs tabular-nums text-text-muted">
            {verifiedCount} / {totalCount} fields
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {metadataResult.container && (
            <span>Container: <span className="font-medium text-text-secondary">{metadataResult.container}</span></span>
          )}
          {metadataResult.engine && (
            <span>Engine: <span className="font-medium text-text-secondary">{metadataResult.engine}</span></span>
          )}
          <span>
            Cover:{" "}
            <span className={`font-medium ${metadataResult.cover_art ? "text-success" : "text-error"}`}>
              {metadataResult.cover_art ? "Yes" : "No"}
            </span>
          </span>
        </div>
      </div>

      {orderedFields.length > 0 && (
        <div className="divide-y divide-border px-5 py-2">
          {orderedFields.map(({ label, value }) => {
            const isDesc = label === "Description";
            const showToggle = isDesc && value.length > 120;
            const displayVal = showToggle && !descExpanded
              ? value.slice(0, 120) + "…"
              : value;
            return (
              <div
                key={label}
                className="flex items-start gap-4 py-2 text-xs"
              >
                <span className="w-24 shrink-0 font-medium text-text-muted">
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-text break-words">
                    {displayVal}
                  </span>
                  {showToggle && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="ml-1 shrink-0 font-medium text-accent-audio hover:text-accent-audio transition-colors"
                    >
                      {descExpanded ? "Show Less" : "Show More"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-text">
            {allVerified ? "✔" : "⚠"} Verification
          </span>
          <span className={`text-xs tabular-nums font-medium ${
            allVerified ? "text-success" : "text-accent-audio"
          }`}>
            {allVerified ? "Passed" : `${verifiedCount} / ${totalCount} Verified`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {checklist.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-1.5 text-xs"
            >
              <span className={item.present ? "text-success" : "text-error"}>
                {item.present ? "✔" : "✖"}
              </span>
              <span className={item.present ? "text-text-secondary" : "text-text-muted"}>
                {item.label}
                {!item.present && (
                  <span className="ml-1 text-error">(Not Available)</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {!allVerified && missingFields.length > 0 && (
          <div className="mt-3 rounded-md bg-error/10 px-3 py-2">
            <p className="text-xs font-medium text-error">Missing:</p>
            <ul className="mt-1 list-inside list-disc text-xs text-error/70">
              {missingFields.map((m) => (
                <li key={m.key}>{m.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
