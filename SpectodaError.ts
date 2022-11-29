import { ErrorFormat, unknownError } from "./errors/errorLibrary";
import { general, nara, studio } from "./errors/errorLibrary";

export class SpectodaError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(code: string, isOperational: boolean = true) {
    super();
    Object.setPrototypeOf(this, new.target.prototype);

    this.code = code;
    this.isOperational = isOperational;
  }
}

type env = "studio" | "nara";
export const getError = (errorCode: string, env?: env): ErrorFormat => {
  if (env == "nara" && errorCode in nara) return nara[errorCode]!;
  if (env == "studio" && errorCode in studio) return studio[errorCode]!;
  if (errorCode in general) return general[errorCode]!;
  else return unknownError(errorCode);
};
