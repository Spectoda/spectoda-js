import { ErrorCode } from "./errors/errorLibrary";
import { ErrorFormat, unknownError } from "./errors/errorLibrary";
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

type env = "studio" | "nara";
export const getError = (errorCode: ErrorCode, env?: env): ErrorFormat => {
  if (env === "nara" && errorCode in app) return app[errorCode]!;
  if (env === "studio" && errorCode in studio) return studio[errorCode]!;
  if (errorCode in general) return general[errorCode]!;
  else return unknownError(errorCode);
};
