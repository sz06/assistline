import type { Meta, StoryObj } from "@storybook/react-vite";
import type React from "react";
import { AiProviderWidget } from "./index";

const meta = {
  title: "Components/AiProviderWidget",
  component: AiProviderWidget,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="min-w-[420px] flex items-center justify-end bg-white dark:bg-gray-950 p-6 border border-gray-200 dark:border-gray-800 rounded-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiProviderWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleProviders = [
  {
    _id: "p1",
    name: "Work OpenAI",
    provider: "openai",
    model: "gpt-4o",
    isDefault: true,
  },
  {
    _id: "p2",
    name: "Anthropic",
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    isDefault: false,
  },
  {
    _id: "p3",
    name: "CLIProxyAPI",
    provider: "cliproxyapi",
    model: "claude-opus-4-5",
    isDefault: false,
  },
];

/** Default state: tokens accrued and the active provider visible */
export const Default: Story = {
  args: {
    stats: {
      totalTokensIn: 42750,
      totalTokensOut: 8312,
      activeProvider: { name: "Work OpenAI", model: "gpt-4o" },
    },
    providers: sampleProviders,
    onSetDefault: (id) => console.log("Set default:", id),
  },
};

/** No tokens yet — first run or fresh install */
export const NoTokens: Story = {
  args: {
    stats: {
      totalTokensIn: 0,
      totalTokensOut: 0,
      activeProvider: {
        name: "Anthropic",
        model: "claude-3-5-sonnet-20241022",
      },
    },
    providers: sampleProviders,
    onSetDefault: (id) => console.log("Set default:", id),
  },
};

/** Large token counts that should be abbreviated (M / k suffix) */
export const LargeTokenCounts: Story = {
  args: {
    stats: {
      totalTokensIn: 3_872_000,
      totalTokensOut: 945_000,
      activeProvider: { name: "Work OpenAI", model: "gpt-4o" },
    },
    providers: sampleProviders,
    onSetDefault: (id) => console.log("Set default:", id),
  },
};

/** No providers configured — switches should be hidden */
export const NoProviders: Story = {
  args: {
    stats: {
      totalTokensIn: 1200,
      totalTokensOut: 300,
      activeProvider: null,
    },
    providers: [],
    onSetDefault: (id) => console.log("Set default:", id),
  },
};

/** Single provider — still shows the dropdown (only one option available) */
export const SingleProvider: Story = {
  args: {
    stats: {
      totalTokensIn: 5000,
      totalTokensOut: 1800,
      activeProvider: { name: "Ollama", model: "llama3.2:latest" },
    },
    providers: [
      {
        _id: "p-local",
        name: "Ollama",
        provider: "ollama",
        model: "llama3.2:latest",
        isDefault: true,
      },
    ],
    onSetDefault: (id) => console.log("Set default:", id),
  },
};
