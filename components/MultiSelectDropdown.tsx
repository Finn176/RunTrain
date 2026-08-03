"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
}

// A checkbox-list dropdown for selecting zero or more values. An empty
// selection means "no filter applied" (shown as `allLabel`), which matches
// how the progress page's year/month filters behave.
export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary =
    selectedLabels.length === 0
      ? allLabel
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between text-left"
      >
        <span className={selectedLabels.length === 0 ? "text-gray-500" : "text-gray-900"}>{summary}</span>
        <span className="ml-2 text-xs text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full min-w-[10rem] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.value))}
              className="font-medium text-brand-700 hover:underline"
            >
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="font-medium text-gray-500 hover:underline">
              Clear
            </button>
          </div>
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggleValue(o.value)}
                className="accent-brand-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
