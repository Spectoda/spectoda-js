import { code, unknownError } from "./errors/errorLibrary";
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

type env = "studio" | "nara";
export const getError = (errorCode: code, env?: env) => {
  if (env == "nara" && errorCode in nara) return nara[errorCode];
  if (env == "studio" && errorCode in studio) return studio[errorCode];
  if (general[errorCode]) return general[errorCode];
  else return unknownError(errorCode);
};
