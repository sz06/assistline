// Shared channel brand icons used across dashboard pages.
// Uses react-icons for official brand SVGs.

import {
  SiFacebook,
  SiInstagram,
  SiTelegram,
  SiWhatsapp,
} from "react-icons/si";

export {
  SiFacebook as FacebookIcon,
  SiInstagram as InstagramIcon,
  SiTelegram as TelegramIcon,
  SiWhatsapp as WhatsAppIcon,
};

/** Map channel type string to its icon component. */
export const channelIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  whatsapp: SiWhatsapp,
  telegram: SiTelegram,
  facebook: SiFacebook,
  instagram: SiInstagram,
};

/** Brand colors for each channel type (used for icon backgrounds). */
export const channelColorMap: Record<string, { bg: string; text: string }> = {
  whatsapp: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  telegram: {
    bg: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-600 dark:text-sky-400",
  },
  facebook: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-600 dark:text-blue-400",
  },
  instagram: {
    bg: "bg-pink-100 dark:bg-pink-900/30",
    text: "text-pink-600 dark:text-pink-400",
  },
};
