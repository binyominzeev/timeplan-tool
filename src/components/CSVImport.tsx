import { useRef } from 'react';

interface Props {
  onFile: (text: string) => void;
}

export function CSVImport({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') onFile(text);
    };
    reader.readAsText(file, 'UTF-8');
    // Reset input so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={handleChange}
      id="csv-file-input"
    />
  );
}
