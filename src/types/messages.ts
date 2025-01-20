export type SpectodaMessage = {
  description: string
  code: number
}

export type SpectodaError = SpectodaMessage

export type SpectodaWarning = SpectodaMessage

export type ControllerError = {
  controller: { mac: string; label: string }
  errors: SpectodaError[]
}

export type ControllerWarning = {
  controller: { mac: string; label: string }
  warnings: SpectodaWarning[]
}

// TODO remove this comment once implemented in spectoda-core
/** On spectoda-core side:
* const SPECTODA_MESSAGE_TYPE = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
})
 * export type SpectodaMessage = {
  description: string
  code: number
  possibleSolutionAction: Promise<void>;
  possibleSolution: string;
  type: keyof typeof SPECTODA_MESSAGE_TYPE;
}
 */
