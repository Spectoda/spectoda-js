/* eslint-disable @typescript-eslint/ban-types */
// Because `Number` refers to our `NumberSchema` and
// `Boolean` refers to our `BooleanSchema`, we need to
// disable the ban on `Number` and `Boolean` types.

import { z } from 'zod'

import {
  NetworkSignatureSchema,
  NetworkKeySchema,
  MacAddressSchema,
  PcbCodeSchema,
  ProductCodeSchema,
  FirmwareVersionSchema,
  FirmwareVersionFullSchema,
  FingerprintSchema,
  TnglBankSchema,
  ControllerNameSchema,
  FirmwareVersionCodeSchema,
} from '../schemas/primitives'
import { BaseCriteriaSchema, SerialCriteriaSchema, BleCriteriaSchema, DummyCriteriaSchema } from '../schemas/criteria'

import { Label, Timestamp, ValueType, Percentage, Date, Color, Pixels, Null, Undefined, ID, IDs } from './values'

type BaseCriteria = z.infer<typeof BaseCriteriaSchema>
type SerialCriteria = z.infer<typeof SerialCriteriaSchema>
type BleCriteria = z.infer<typeof BleCriteriaSchema>
type DummyCriteria = z.infer<typeof DummyCriteriaSchema>

type criteria_generic = BaseCriteria
type criteria_ble = BleCriteria
type criteria_serial = SerialCriteria
type criteria_dummy = criteria_generic
type criteria_simulated = criteria_generic
type criteria = criteria_ble | criteria_serial | criteria_dummy | criteria_simulated

type TnglBytes = Uint8Array
type UsedIds = Uint8Array
type Criterium = criteria
type Criteria = criteria | criteria[]
type Tngl = {
  code: string | undefined
  bytecode: Uint8Array | undefined
}

type NetworkSignature = z.infer<typeof NetworkSignatureSchema>
type NetworkKey = z.infer<typeof NetworkKeySchema>
type MacAddress = z.infer<typeof MacAddressSchema>
type PcbCode = z.infer<typeof PcbCodeSchema>
type ProductCode = z.infer<typeof ProductCodeSchema>
type FirmwareVersion = z.infer<typeof FirmwareVersionSchema>
type FirmwareVersionFull = z.infer<typeof FirmwareVersionFullSchema>
type FirmwareVersionCode = z.infer<typeof FirmwareVersionCodeSchema>
type Fingerprint = z.infer<typeof FingerprintSchema>
type TnglBank = z.infer<typeof TnglBankSchema>

type ControllerName = z.infer<typeof ControllerNameSchema>
type ControllerConnectionCriteria = {
  controllerLabel: Label
  productCode: ProductCode
  macAddress: MacAddress
  fwVersion: FirmwareVersion
  networkSignature: NetworkSignature
  commissionable: boolean
}
type ControllerMoreData = {
  fullName: ControllerName
  pcbCode: PcbCode
  fwVersionFull: FirmwareVersionFull
  fwVersionCode: FirmwareVersionCode
  fwCompilationUnixTimestamp: Timestamp
  tnglFingerprint: Fingerprint
  eventStoreFingerprint: Fingerprint
  configFingerprint: Fingerprint
}
type ControllerInfo = ControllerConnectionCriteria & ControllerMoreData

export type {
  BaseCriteria,
  SerialCriteria,
  BleCriteria,
  DummyCriteria,
  ControllerConnectionCriteria,
  ControllerMoreData,
  ControllerInfo,
  NetworkSignature,
  NetworkKey,
  MacAddress,
  PcbCode,
  ProductCode,
  FirmwareVersion,
  FirmwareVersionFull,
  FirmwareVersionCode,
  Fingerprint,
  TnglBank,
  ControllerName,
}

/** @deprecated use individual types instead */
export type SpectodaTypes = {
  BaseCriteria: BaseCriteria
  SerialCriteria: SerialCriteria
  BleCriteria: BleCriteria
  DummyCriteria: DummyCriteria
  TnglBytes: TnglBytes
  UsedIds: UsedIds
  Criterium: Criterium
  Criteria: Criteria
  Tngl: Tngl
  ValueType: ValueType
  Number: Number
  Label: Label
  Timestamp: Timestamp
  Percentage: Percentage
  Date: Date
  Color: Color
  Pixels: Pixels
  Boolean: Boolean
  Null: Null
  Undefined: Undefined
  ID: ID
  IDs: IDs
  NetworkSignature: NetworkSignature
  NetworkKey: NetworkKey
  MacAddress: MacAddress
  PcbCode: PcbCode
  ProductCode: ProductCode
  FirmwareVersion: FirmwareVersion
  FirmwareVersionFull: FirmwareVersionFull
  FirmwareVersionCode: FirmwareVersionCode
  Fingerprint: Fingerprint
  TnglBank: TnglBank
  ControllerName: ControllerName
  ControllerInfo: ControllerInfo
}
