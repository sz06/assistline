import { Button } from "@repo/ui";
import { AlertCircle, FileSpreadsheet, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

export interface ParsedContact {
  sourceId: string;
  name?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  handles: Array<{ type: "phone" | "email"; value: string; label?: string }>;
}

export function GoogleCSVImporter({
  onParsed,
}: {
  onParsed: (contacts: ParsedContact[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setError(null);
      setIsParsing(true);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setIsParsing(false);
          if (results.errors.length > 0 && results.data.length === 0) {
            setError("Failed to parse the CSV file. Please check the format.");
            return;
          }

          const parsed: ParsedContact[] = [];
          (results.data as Array<Record<string, string>>).forEach(
            (row, index: number) => {
              // Google Contacts CSV mapping
              let name =
                row["Name"] ||
                `${row["First Name"] || row["Given Name"] || ""} ${row["Last Name"] || row["Family Name"] || ""}`.trim() ||
                undefined;
              const company =
                row["Organization 1 - Name"] ||
                row["Organization Name"] ||
                undefined;
              const jobTitle =
                row["Organization 1 - Title"] ||
                row["Organization Title"] ||
                undefined;

              if (!name && company) {
                name = company;
              }
              const notes = row["Notes"] || undefined;

              const handles: ParsedContact["handles"] = [];

              // Parse emails (up to 3)
              for (let i = 1; i <= 3; i++) {
                const emailValStr = row[`E-mail ${i} - Value`];
                const emailLabelStr = row[`E-mail ${i} - Label`] || row[`E-mail ${i} - Type`];
                
                if (emailValStr) {
                  const parts = emailValStr.split(" ::: ");
                  const labelParts = emailLabelStr ? emailLabelStr.split(" ::: ") : [];
                  
                  parts.forEach((val, idx) => {
                    const cleanVal = val.trim();
                    if (cleanVal) {
                      handles.push({
                        type: "email",
                        value: cleanVal,
                        label: labelParts[idx]?.trim() || labelParts[0]?.trim() || "Email",
                      });
                    }
                  });
                }
              }

              // Parse phones (up to 5)
              for (let i = 1; i <= 5; i++) {
                const phoneValStr = row[`Phone ${i} - Value`];
                const phoneLabelStr = row[`Phone ${i} - Label`] || row[`Phone ${i} - Type`];
                
                if (phoneValStr) {
                  const parts = phoneValStr.split(" ::: ");
                  const labelParts = phoneLabelStr ? phoneLabelStr.split(" ::: ") : [];
                  
                  parts.forEach((val, idx) => {
                    const cleanVal = val.trim();
                    if (cleanVal) {
                      handles.push({
                        type: "phone",
                        value: cleanVal,
                        label: labelParts[idx]?.trim() || labelParts[0]?.trim() || "Mobile",
                      });
                    }
                  });
                }
              }

              if (!name && handles.length === 0) return; // Skip completely empty rows

              parsed.push({
                sourceId: `csv_${index}`,
                name,
                company,
                jobTitle,
                notes,
                handles,
              });
            },
          );

          if (parsed.length === 0) {
            setError("No valid contacts found in this CSV.");
            return;
          }

          onParsed(parsed);
        },
        error: (err: Error) => {
          setIsParsing(false);
          setError(`File reading error: ${err.message}`);
        },
      });
    },
    [onParsed],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  return (
    <div className="space-y-4 max-w-xl mx-auto mt-8">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            {isParsing ? (
              <FileSpreadsheet className="h-6 w-6 animate-pulse" />
            ) : (
              <UploadCloud className="h-6 w-6" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {isParsing ? "Parsing CSV..." : "Upload Google Contacts CSV"}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Drag and drop your exported CSV here, or click to browse
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-900/40">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">
          How to export from Google Contacts
        </h4>
        <ol className="list-decimal list-inside text-xs text-blue-800 dark:text-blue-400 mt-2 space-y-1.5">
          <li>
            Go to{" "}
            <a
              href="https://contacts.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-blue-900 dark:hover:text-blue-300"
            >
              contacts.google.com
            </a>
          </li>
          <li>
            Click <strong>Export</strong> in the left sidebar
          </li>
          <li>
            Choose <strong>Google CSV</strong> as the export format
          </li>
          <li>Click Export and upload the file above</li>
        </ol>
      </div>
    </div>
  );
}
