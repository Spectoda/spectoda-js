/* eslint-disable @typescript-eslint/no-namespace */
import { VALUE_TYPE } from '../constants'

export namespace SpectodaTypes {
  type criteria_generic = {
    connector?: string
    mac?: string
    name?: string
    nameprefix?: string
    network?: string
    fw?: string
    product?: number
    commisionable?: boolean
  }

  type criteria_ble = criteria_generic

  type criteria_serial =
    | criteria_generic
    | {
        path?: string
        manufacturer?: string
        serialNumber?: string
        pnpId?: string
        locationId?: string
        productId?: string
        vendorId?: string
        baudrate?: number
        baudRate?: number
      }

  type criteria_dummy = criteria_generic

  type criteria_simulated = criteria_generic

  type criteria =
    | criteria_ble
    | criteria_serial
    | criteria_dummy
    | criteria_simulated

  export type TnglBytes = Uint8Array

  export type UsedIds = Uint8Array

  export type Criterium = criteria

  export type Criteria = criteria | criteria[]

  export type Tngl = {
    code: string | undefined
    bytecode: Uint8Array | undefined
  }

  /**
   * Unique network identifier as a 32-character lowercase hexadecimal string.
   *
   * Format: `"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` (characters: `a-f`, `0-9`)
   */
  export type NetworkSignature = string

  /**
   * Secure 32-character hexadecimal key for network access.
   *
   * Format: `"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` (characters: `a-f`, `0-9`)
   */
  export type NetworkKey = string

  /**
   * PCB (Printed Circuit Board) code.
   *
   * Range: 0 - 16535
   */
  export type PcbCode = number

  /**
   * Product code for specific models.
   *
   * Range: 0 - 16535
   */
  export type ProductCode = number

  /**
   * TNGL bank identifier.
   *
   * Range: 0 - 255
   */
  export type TnglBank = number

  export type ValueType = (typeof VALUE_TYPE)[keyof typeof VALUE_TYPE]

  export type Number = number

  /**
   * Short label prefixed with `$`, max 5 alphanumeric chars (`[a-zA-Z0-9_]`).
   *
   * @example $color
   */
  export type Label = string

  export type Timestamp = number

  export type Percentage = number

  export type Date = string

  export type Color = string

  export type Pixels = number

  export type Boolean = boolean

  export type Null = null

  export type Undefined = undefined

  /**
   * ID of an event or segment.
   *
   * Range: 0 - 255
   */
  export type ID = number
  export type IDs = ID | ID[]

  /**
   * Represents detailed information about a controller, including both 
   * connection criteria and additional metadata.
   */
  export type ControllerInfo = {
    /** 
     * @group ConnectionCriteria
     * @description A human-readable label identifying the controller.
     */
    controllerLabel: string;

    /** 
     * @group ConnectionCriteria
     * @description Numeric code representing the product type or model.
     */
    productCode: number;

    /** 
     * @group ConnectionCriteria
     * @description The MAC address associated with the controller.
     */
    macAddress: string;

    /** 
     * @group ConnectionCriteria
     * @description Firmware version currently installed on the controller.
     */
    fwVersion: string;

    /** 
     * @group ConnectionCriteria
     * @description Unique signature identifying the network configuration.
     */
    networkSignature: string;

    /** 
     * @group ConnectionCriteria
     * @description Indicates if the controller is commissionable.
     */
    commissionable: boolean;

    /** 
     * The full name or identifier of the controller.
     */
    fullName: string;

    /** 
     * Code representing the PCB (Printed Circuit Board) version.
     */
    pcbCode: number;

    /** 
     * Full version information of the firmware.
     */
    fwVersionFull: string;

    /** 
     * Numeric representation of the firmware version.
     */
    fwVersionCode: number;

    /** 
     * Unix timestamp indicating the firmware compilation date and time.
     */
    fwCompilationUnixTimestamp: number;

    /** 
     * Fingerprint identifying the TNG-L component version.
     */
    tnglFingerprint: string;

    /** 
     * Fingerprint identifying the event store state or version.
     */
    eventStoreFingerprint: string;

    /** 
     * Fingerprint identifying the configuration state or version.
     */
    configFingerprint: string;
  };
}
