export type SpectodaJsError = {
  description: string
  code: number
  type: 'error' | 'warning'
}

export type ControllerErrors = {
  controller: { mac: string; label: string }
  errorUpdates: SpectodaJsError[]
}
