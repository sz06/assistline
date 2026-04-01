import { Button } from "@repo/ui";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface EmptyMergeStateProps {
  onReturn?: () => void;
}

export function EmptyMergeState({ onReturn }: EmptyMergeStateProps) {
  const navigate = useNavigate();

  const handleReturn = () => {
    if (onReturn) {
      onReturn();
    } else {
      navigate("/contacts");
    }
  };

  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl p-12 text-center flex flex-col items-center">
      <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
        <Check className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        No duplicates found!
      </h2>
      <p className="text-gray-500 max-w-md">
        Your contacts database is clean and deduplicated. We didn't find any
        overlapping phone numbers or email addresses.
      </p>
      <Button onClick={handleReturn} className="mt-8">
        Return to Contacts
      </Button>
    </div>
  );
}
