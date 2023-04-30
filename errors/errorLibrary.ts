/*
 * ERROR GUIDELINES
 *
 * USE THE FOLLOWING FORMAT WHEN ADDING NEW ERRORS:
 * ErrorCode: {
 *   title: "What happened",
 *   message: "What should you do",
 *   url: "OPTIONAL: Link to documentation",
 * }
 *
 * TITLE: What happened
 * e.g. We couldn't create your profile
 *
 * MESSAGE: Why it happened and what can the user do about it. Help the user understand, guide him.
 * e.g. // todo add
 *
 * Goal:
 * - Help the user understand what happened. Was it a bug we should fix? Was it a typo he can fix?
 * - Use simple language, be polite
 * - Provide actionable, specific instructions
 *
 * Avoid:
 * - CAPITALIZATION, exclamation marks (don't shout at the user)
 * - Oopsie, Whoops (the user is already annoyed, don't make it worse)
 * - Generic information (e.g. "Something went wrong")
 * - Technical information/jargon (e.g. "Error g557xx29@"")
 * - Generic information, ambiguity (e.g. "Something went wrong", "The item was moved, deleted, removed or archived")
 */

import { t } from "../i18n";
export interface ErrorFormat {
  title: string;
  message: string;
  url?: string;
}
interface ErrorList {
  [key: string]: ErrorFormat;
}

// Errors specific for NARA
export const nara = {
  MicAccessDenied: {
    title: t("Mikrofon se nepodařilo spustit."),
    message: t("Zkontrolujte, zda jste v Nastavení povolili aplikaci přístup k mikrofonu."),
  },
  UserCanceledSelection: {
    title: t("Spárování nové lampy se nezdařilo"),
    message: t("Pro připojení již spárované lampy prosím stiskněte jakýkoli symbol") + ' "🛑"',
  },
} as const;

// Errors specific for STUDIO
export const studio = {
  MicAccessDenied: {
    title: "Microphone access denied",
    message: "Make sure you've enabled microphone access in Settings. If so, refresh the current page, delete cookies and try again.",
  },
} as const;

// General error messages
export const general = {
  DeviceDisconnected: {
    title: "Device Disconnected",
    message: "The device has been disconnected. Please reconnect the device and try again.",
  },
  DeviceUnsupported: {
    title: "Your device is not supported",
    message: "//todo WHAT DEVICES ARE (NOT) SUPPORTED?",
  },
  MicAccessDenied: {
    title: "Microphone access denied",
    message: "Please allow access to your microphone in your settings.",
  },
  UserCanceledSelection: {
    title: "Connection canceled",
    message: 'Device selection has been canceled. To complete connection, select a device from the dropdown list and select "Pair".',
  },
  ReadOutOfRange: {
    title: "Internal Processing Error",
    message: "Something went wrong while processing your request. Please try again later or contact support for assistance.",
  },
  UserNotLoggedInSwitchToIntegratedNetwork: {
    title: "You are not logged in",
    message: "Please log in to your account to switch networks.",
  },
  NetworkDoesNotExistSwitchNetwork: {
    title: "Network does not exist",
    message: "The network you are trying to switch to does not exist. Please contact support for assistance.",
  },
  NetworkNotFound: {
    title: "Network not found",
    message: "The network you are trying to access does not exist. Please contact support for assistance.",
  },
  NetworkAlreadyLoaded: {
    title: "Network already loaded",
    message: "The network you are trying to load is already loaded.",
  },
} as const;

// Appears when error is not defined above
export const unknownError = {
  title: "Unknown Error",
  message: "An unknown error has occurred. Please contact us for support.",
};

export type ErrorCode = keyof typeof general;
