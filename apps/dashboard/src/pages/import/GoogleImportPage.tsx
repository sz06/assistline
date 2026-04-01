import { api } from "@repo/api";
import { Button, PageHeader } from "@repo/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation } from "convex/react";
import { ArrowRight, Check } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GoogleCSVImporter,
  type ParsedContact,
} from "../../components/contacts/GoogleCSVImporter";

export function GoogleImportPage() {
  const navigate = useNavigate();
  const executeImport = useMutation(api.contacts.import.executeImportBatch);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceData, setSourceData] = useState<ParsedContact[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleParsed = (contacts: ParsedContact[]) => {
    setSourceData(contacts);
    setStep(2);
  };

  const handleExecute = async () => {
    setIsImporting(true);

    const CHUNK_SIZE = 100;
    let totalCreated = 0;

    try {
      for (let i = 0; i < sourceData.length; i += CHUNK_SIZE) {
        const chunk = sourceData.slice(i, i + CHUNK_SIZE);
        const res = await executeImport({ contacts: chunk });
        totalCreated += res.createdCount;
      }
      setFinalSummary({ created: totalCreated });
      setStep(3);
    } catch (e) {
      console.error(e);
    } finally {
      setIsImporting(false);
    }
  };

  const [finalSummary, setFinalSummary] = useState<{
    created: number;
  } | null>(null);

  // Virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sourceData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88, // estimated row height
    overscan: 10,
  });

  return (
    <div className="p-4 md:p-6 w-full h-[calc(100vh-theme(spacing.16))] flex flex-col">
      <PageHeader
        title="Import Google Contacts"
        description="Review and resolve conflicts before finalizing the import."
      />

      <div className="mt-6 flex items-center justify-center max-w-2xl mx-auto mb-6 shrink-0">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}
        >
          1
        </div>
        <div
          className={`flex-1 h-1 mx-2 ${step >= 2 ? "bg-blue-600" : "bg-gray-200"}`}
        />
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}
        >
          2
        </div>
        <div
          className={`flex-1 h-1 mx-2 ${step >= 3 ? "bg-blue-600" : "bg-gray-200"}`}
        />
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${step >= 3 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}
        >
          3
        </div>
      </div>

      {step === 1 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm mx-auto max-w-3xl w-full">
          <GoogleCSVImporter onParsed={handleParsed} />
        </div>
      )}

      {step === 2 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Review Contacts
              </h2>
              <p className="text-sm text-gray-500">
                We found {sourceData.length} valid contacts in your file.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/contacts/import")}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button onClick={handleExecute} disabled={isImporting}>
                {isImporting ? "Importing..." : "Looks Good, Import Data"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Header row for 'table' */}
            <div className="bg-gray-50 dark:bg-gray-800/60 shadow-sm border-b border-gray-200 dark:border-gray-800 flex text-sm font-semibold text-gray-600 dark:text-gray-300 shrink-0 z-10">
              <div className="px-5 py-3 flex-1">Incoming Contact</div>
            </div>

            {/* Virtualized body */}
            <div
              ref={parentRef}
              className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-900/50"
            >
              {isImporting && (
                <div className="flex flex-col gap-3 h-full w-full items-center justify-center text-gray-500 absolute inset-0 bg-white/50 dark:bg-gray-900/80 z-20 backdrop-blur-sm">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="font-medium animate-pulse">Importing contacts...</p>
                </div>
              )}

              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const contact = sourceData[virtualRow.index];

                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="border-b border-gray-100 dark:border-gray-800 flex flex-row items-center hover:bg-gray-50 dark:hover:bg-gray-800/40 bg-white dark:bg-gray-900 transition-colors"
                    >
                      <div className="px-5 py-4 flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                          {contact.name || "Unknown Name"}
                        </p>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {contact.handles
                            .map((h) => `${h.type}: ${h.value}`)
                            .join(", ")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && finalSummary && (
        <div className="bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 rounded-xl p-10 shadow-sm text-center max-w-lg mx-auto mt-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-4">
            <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Import Complete!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your contacts have been successfully synced to Assistline.
          </p>

          <div className="flex gap-4 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-lg border border-gray-100 dark:border-gray-800 mb-8 justify-center">
            <div className="text-center px-4">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {finalSummary.created}
              </p>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 mt-1">
                Successfully Imported
              </p>
            </div>
          </div>

          <Button onClick={() => navigate("/contacts")} className="w-full">
            Return to Contacts
          </Button>
        </div>
      )}
    </div>
  );
}
