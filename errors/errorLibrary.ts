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

// Errors specific for NARA environment
export const nara = {
  DeviceDisconnected: {
    title: "Device Disconnected",
    message: "The device has been disconnected. Please reconnect the device and try again.",
  },
};

// Errors specific for STUDIO environment
export const studio = {
  DeviceDisconnected: {
    title: "Device Disconnected",
    message: "The device has been disconnected. Please reconnect the device and try again.",
  },
};

// General error messages
export const general = {
  DeviceDisconnected: {
    title: "Device Disconnected",
    message: "The device has been disconnected. Please reconnect the device and try again.",
  },
};

export type code = keyof typeof general & keyof typeof nara & keyof typeof studio;
