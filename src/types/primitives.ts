/* eslint-disable @typescript-eslint/no-namespace */
import { z } from 'zod'

import {
  NumberSchema,
  LabelSchema,
  TimestampSchema,
  PercentageSchema,
  DateSchema,
  ColorSchema,
  PixelsSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
  IDSchema,
  NetworkSignatureSchema,
  NetworkKeySchema,
  MacAddressSchema,
  PcbCodeSchema,
  ProductCodeSchema,
  FirmwareVersionSchema,
  FirmwareVersionFullSchema,
  FingerprintSchema,
  TnglBankSchema,
  ControllerNameSchema as ControllerNameSchema,
} from '../schemas/primitives'
import { BaseCriteriaSchema, SerialCriteriaSchema, BleCriteriaSchema } from '../schemas/criteria'
import { VALUE_TYPES } from '../constants/values'

export namespace SpectodaTypes {
  export type BaseCriteria = z.infer<typeof BaseCriteriaSchema>
  export type SerialCriteria = z.infer<typeof SerialCriteriaSchema>
  export type BleCriteria = z.infer<typeof BleCriteriaSchema>

  type criteria_generic = BaseCriteria
  type criteria_ble = BleCriteria
  type criteria_serial = SerialCriteria
  type criteria_dummy = criteria_generic
  type criteria_simulated = criteria_generic
  type criteria = criteria_ble | criteria_serial | criteria_dummy | criteria_simulated

  export type TnglBytes = Uint8Array
  export type UsedIds = Uint8Array
  export type Criterium = criteria
  export type Criteria = criteria | criteria[]
  export type Tngl = {
    code: string | undefined
    bytecode: Uint8Array | undefined
  }

  export type ValueType = (typeof VALUE_TYPES)[keyof typeof VALUE_TYPES]
  export type Number = z.infer<typeof NumberSchema>
  export type Label = z.infer<typeof LabelSchema>
  export type Timestamp = z.infer<typeof TimestampSchema>
  export type Percentage = z.infer<typeof PercentageSchema>
  export type Date = z.infer<typeof DateSchema>
  export type Color = z.infer<typeof ColorSchema>
  export type Pixels = z.infer<typeof PixelsSchema>
  export type Boolean = z.infer<typeof BooleanSchema>
  export type Null = z.infer<typeof NullSchema>
  export type Undefined = z.infer<typeof UndefinedSchema>
  export type ID = z.infer<typeof IDSchema>
  export type IDs = ID | ID[]

  // Network and device types
  export type NetworkSignature = z.infer<typeof NetworkSignatureSchema>
  export type NetworkKey = z.infer<typeof NetworkKeySchema>
  export type MacAddress = z.infer<typeof MacAddressSchema>
  export type PcbCode = z.infer<typeof PcbCodeSchema>
  export type ProductCode = z.infer<typeof ProductCodeSchema>
  export type FirmwareVersion = z.infer<typeof FirmwareVersionSchema>
  export type FirmwareVersionFull = z.infer<typeof FirmwareVersionFullSchema>
  export type Fingerprint = z.infer<typeof FingerprintSchema>
  export type TnglBank = z.infer<typeof TnglBankSchema>
  export type ControllerName = z.infer<typeof ControllerNameSchema>

  // Controller info type
  export type ControllerInfo = {
    // Connection criteria
    controllerLabel: Label
    productCode: ProductCode
    macAddress: MacAddress
    fwVersion: FirmwareVersion
    networkSignature: NetworkSignature
    commissionable: boolean

    // Additional metadata
    fullName: ControllerName
    pcbCode: PcbCode
    fwVersionFull: FirmwareVersionFull
    fwVersionCode: FirmwareVersion
    fwCompilationUnixTimestamp: Timestamp
    tnglFingerprint: Fingerprint
    eventStoreFingerprint: Fingerprint
    configFingerprint: Fingerprint
  }
}
