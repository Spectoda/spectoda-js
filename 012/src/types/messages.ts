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
