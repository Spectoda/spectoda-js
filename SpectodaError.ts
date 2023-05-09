import { ErrorFormat, ErrorCode, unknownError } from "./errors/errorLibrary";
import { general, app, studio } from "./errors/errorLibrary";

export class SpectodaError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(code: string, isOperational = true) {
    super();
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.isOperational = isOperational;
  }
}

type env = "app" | "studio";
// Using @ts-ignore as we can guarantee the the error code is always found
export const getError = (errorCode: ErrorCode, env?: env): ErrorFormat => {
  // @ts-ignore
  if (env === "app" && errorCode in app) return app[errorCode] || unknownError;
  // @ts-ignore
  if (env === "studio" && errorCode in studio) return studio[errorCode] || unknownError;
  if (errorCode in general) return general[errorCode] || unknownError;
  else return unknownError;
};

export const throwError = (errorCode: ErrorCode) => {
  throw new Error(errorCode);
};
