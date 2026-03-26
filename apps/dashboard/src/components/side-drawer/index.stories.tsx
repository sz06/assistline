import { Button } from "@repo/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LayoutDashboard, Settings, Users } from "lucide-react";
import { useState } from "react";
import { Sidedrawer } from "./index";

// Wrap in a stateful component so we can toggle it in Storybook
const SidedrawerWithState = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="p-8 h-screen bg-gray-100 dark:bg-gray-950 flex flex-col items-start gap-4">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm w-full max-w-md border border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Sidedrawer Demo
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Click the button below to open the mobile side drawer. Normally, this
          component is hidden on medium screens and larger (`md:hidden`), but
          we're forcing it to be visible here for demonstration purposes using
          `className="!block"`.
        </p>
        <Button onClick={() => setIsOpen(true)}>Open Drawer</Button>
      </div>

      <div className="md:hidden">
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-4">
          Resize window to mobile width or use responsive mode to see the drawer
          in action!
        </p>
      </div>

      <Sidedrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="!block"
      >
        <aside className="h-full w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
          <div className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
                A
              </div>
              <span className="font-semibold text-lg dark:text-gray-100">
                Assistline
              </span>
            </div>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              Dashboard
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <Users className="h-5 w-5 shrink-0" />
              Users
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <Settings className="h-5 w-5 shrink-0" />
              Settings
            </button>
          </nav>
        </aside>
      </Sidedrawer>
    </div>
  );
};

const meta = {
  title: "Components/Sidedrawer",
  component: Sidedrawer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Sidedrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SidedrawerWithState />,
};
