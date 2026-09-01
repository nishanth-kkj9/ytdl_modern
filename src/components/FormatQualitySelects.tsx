interface FormatOption {
  value: string;
  label: string;
}

interface FormatQualitySelectsProps {
  formats: FormatOption[];
  qualities: FormatOption[];
  selectedFormat: string;
  selectedQuality: string;
  onFormatChange: (value: string) => void;
  onQualityChange: (value: string) => void;
}

export function FormatQualitySelects({
  formats,
  qualities,
  selectedFormat,
  selectedQuality,
  onFormatChange,
  onQualityChange,
}: FormatQualitySelectsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:flex">
      <label className="flex flex-1 flex-col gap-1 sm:flex-none">
        <span className="eyebrow">Format</span>
        <select
          value={selectedFormat}
          onChange={(e) => onFormatChange(e.target.value)}
          className="select-input w-full sm:w-40"
          aria-label="Format"
        >
          {formats.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1 sm:flex-none">
        <span className="eyebrow">Quality</span>
        <select
          value={selectedQuality}
          onChange={(e) => onQualityChange(e.target.value)}
          className="select-input w-full sm:w-40"
          aria-label="Quality"
        >
          {qualities.map((q) => (
            <option key={q.value} value={q.value}>{q.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
