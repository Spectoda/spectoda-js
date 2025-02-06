/** @deprecated TODO REMOVE THIS FILE */

import { z } from 'zod'

import { DeviceConnectionCriteria } from '../types'

export const CONNECTION = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected',
  DISCONNECTING: 'disconnecting',
} as const

export type ConnectionStatus = (typeof CONNECTION)[keyof typeof CONNECTION]

export const CONNECTORS = [
  { key: 'default', name: 'Automatic', hidden: false },
  { key: 'webbluetooth', name: 'Bluetooth', hidden: false },
  { key: 'webserial', name: 'Web Serial', hidden: false },
  { key: 'dummy', name: 'Simulated', hidden: false },
  { key: 'websockets', name: 'Remote', hidden: true },
  { key: 'flutter', name: 'Flutter', hidden: true },
  { key: 'tangleconnect', name: 'Tangle Connect', hidden: true },
  { key: 'edummy', name: 'Dummy With Errors', hidden: true },
  { key: 'vdummy', name: 'Dummy With Version', hidden: true },
] as const

export type ConnectorType = (typeof CONNECTORS)[number]['key']

export type TString = z.infer<typeof TStringSchema>
export const TStringSchema = z.string()

export type TMacObject = z.infer<typeof MacObjectSchema>
export const MacObjectSchema = z.object({
  mac: z.string(),
  rssi: z.number(),
})

type ConnectOptions = {
  devices?: DeviceConnectionCriteria[] | null
  autoConnect?: boolean
  ownerSignature?: string | null
  ownerKey?: string | null
  connectAny?: boolean
  fwVersion?: string
}
