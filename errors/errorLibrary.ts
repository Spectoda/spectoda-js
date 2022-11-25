/*
 * ERROR GUIDELINES
 *
 * USE THE FOLLOWING FORMAT WHEN ADDING NEW ERRORS:
 * ErrorCode: {
 *   title: "What happened",
 *   message: "What should you do",
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

// Errors specific for NARA
export const nara = {
  MicAccessDenied: {
    title: t("Mikrofon se nepodařilo spustit."),
    message: t("Zkontrolujte, zda jste v Nastavení povolili aplikaci přístup k mikrofonu."),
  },
  UserCancelledSelection: {
    title: t("Spárování nové lampy se nezdařilo"),
    message: t("Pro připojení již spárované lampy prosím stiskněte jakýkoli symbol") + ' "🛑"',
  },
};

// Errors specific for STUDIO
export const studio = {
  MicAccessDenied: {
    title: "Microphone access denied",
    message: "Make sure you've enabled microphone access in Settings. If so, refresh the current page, delete cookies and try again.",
  },
};

// All error messages
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
};

// Appears when error is not defined above
export const unknownError = (errorCode: string) => ({
  title: "Unknown Error",
  message: "An unknown error has occurred. Please contact us for support. Error code: " + errorCode,
});

export type code = keyof typeof general & keyof typeof nara & keyof typeof studio;
