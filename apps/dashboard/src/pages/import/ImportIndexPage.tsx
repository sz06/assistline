import { PageHeader } from "@repo/ui";
import { FileSpreadsheet, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ImportIndexPage() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 mx-auto h-full flex flex-col">
      <PageHeader
        title="Import Contacts"
        description="Select a data source to bring your external network into Assistline seamlessly."
      />

      <div className="flex-1 flex flex-col items-center justify-center mt-8">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 lg:p-12 shadow-sm max-w-3xl w-full">
          <h2 className="text-2xl font-bold mb-8 text-center text-gray-900 dark:text-gray-100">
            Select Your Source
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
            <button
              type="button"
              onClick={() => navigate("/contacts/import/google")}
              className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors shadow-sm cursor-pointer group"
            >
              <FileSpreadsheet className="h-12 w-12 mb-4 text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-xl mb-1">Google Contacts</span>
              <span className="text-sm opacity-80">Upload CSV Export</span>
            </button>
            <button
              type="button"
              disabled
              className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400 bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed"
            >
              <ShieldAlert className="h-12 w-12 mb-4" />
              <span className="font-bold text-xl mb-1">Apple Contacts</span>
              <span className="text-sm">Coming Soon (vCard)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
