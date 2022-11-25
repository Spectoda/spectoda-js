import type { code } from "./errors/errorLibrary";
import { general, nara, studio } from "./errors/errorLibrary";

export class SpectodaError extends Error {
  public readonly code: code;
  public readonly isOperational: boolean;

  constructor(code: code, isOperational: boolean = true) {
    super();
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.isOperational = isOperational;
  }
}

export type env = "studio" | "nara";

export const getError = (errorCode: keyof typeof general, env?: env) => {
  if (env == "nara" && nara[errorCode]) return nara[errorCode];
  if (env == "studio" && studio[errorCode]) return studio[errorCode];
  if (general[errorCode]) return general[errorCode];
  else
    return {
      title: "Unknown Error",
      message: `An unknown error has occurred. Please contact us for support. Error code: ${errorCode}`,
    };
};
