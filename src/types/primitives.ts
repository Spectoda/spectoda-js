/* eslint-disable @typescript-eslint/no-namespace */
import { VALUE_TYPE } from '../constants'

export namespace SpectodaTypes {
  type criteria_generic = Partial<{
    connector: string
    mac: ControllerInfo['macAddress']
    name: ControllerInfo['controllerLabel']
    nameprefix: string
    network: ControllerInfo['networkSignature']
    fw: ControllerInfo['fwVersion']
    product: ControllerInfo['productCode']
    commisionable: ControllerInfo['commissionable']
  }>

  type criteria_ble = criteria_generic

  type criteria_serial = criteria_generic &
    Partial<{
      path: string
      baudrate: number
    }>

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

  /**
   * Unique network identifier as a 32-character lowercase hexadecimal string.
   *
   * Format: `"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` (characters: `a-f`, `0-9`)
   *
   * @example "34567890123456789012345678901234"
   */
  export type NetworkSignature = string

  /**
   * Secure 32-character hexadecimal key for network access.
   *
   * Format: `"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` (characters: `a-f`, `0-9`)
   *
   * @example "34567890123456789012345678901234"
   */
  export type NetworkKey = string

  /**
   * PCB (Printed Circuit Board) code.
   *
   * Range: 0 - 16535
   *
   * @example 32
   */
  export type PcbCode = number

  /**
   * Product code for specific models.
   *
   * Range: 0 - 16535
   *
   * @example 24
   */
  export type ProductCode = number

  /**
   * TNGL bank identifier.
   *
   * Range: 0 - 255
   */
  export type TnglBank = number

  export type ValueType = (typeof VALUE_TYPE)[keyof typeof VALUE_TYPE]

  /**
   * Whole integer number value. Range: -1000000000 to 1000000000
   *
   * @example 10000
   */
  export type Number = number

  /**
   * String of max 5 alphanumeric chars (`[a-zA-Z0-9_]`).
   *
   * @example "toggl", "brigh", "color", "P_ena", "LIGHT"
   */
  export type Label = string

  /**
   * Timestamp in milliseconds. Range: -86400000 to 86400000
   *
   * @example 86400000
   */
  export type Timestamp = number

  /**
   * Percentage value with 6 decimal places. Range: -100.000000 to 100.000000
   *
   * @example 99.234567
   */
  export type Percentage = number

  /**
   * Date string in ISO 8601 format.
   *
   * @example "2024-01-01"
   */
  export type Date = string

  /**
   * Color string in hexadecimal format, where the `#` is optional.
   *
   * @example "FF0000", "#FF0000"
   */
  export type Color = string

  /**
   * Pixels value. Range: -32768 to 32767
   *
   * @example 100
   */
  export type Pixels = number

  /**
   * Boolean value.
   *
   * @example true, false
   */
  export type Boolean = boolean

  /**
   * Null value.
   *
   * @example null
   */
  export type Null = null

  /**
   * Undefined value.
   *
   * @example undefined
   */
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
     * @description A human-readable 5 character label identifying the controller.
     */
    controllerLabel: string

    /**
     * @group ConnectionCriteria
     * @description Numeric code representing the product type or model.
     */
    productCode: number

    /**
     * @group ConnectionCriteria
     * @description The MAC address associated with the controller. E.g. "12:43:ab:8d:ff:04"
     */
    macAddress: string

    /**
     * @group ConnectionCriteria
     * @description Firmware version currently installed on the controller. E.g. "0.12.2"
     */
    fwVersion: string

    /**
     * @group ConnectionCriteria
     * @description Unique signature identifying the network configuration. Provided as a hexstring.
     */
    networkSignature: string

    /**
     * @group ConnectionCriteria
     * @description Indicates if the controller is commissionable.
     */
    commissionable: boolean

    /**
     * The full name or identifier of the controller.
     */
    fullName: string

    /**
     * Code representing the PCB (Printed Circuit Board) version.
     */
    pcbCode: number

    /**
     * Full version information of the firmware. E.g. "UNIVERSAL_0.12.2_20250208"
     */
    fwVersionFull: string

    /**
     * Numeric representation of the firmware version. E.g. 1202 for 0.12.2
     */
    fwVersionCode: number

    /**
     * Unix timestamp indicating the firmware compilation date and time in seconds since epoch.
     */
    fwCompilationUnixTimestamp: number

    /**
     * SHA256 hash of uploaded tnglBytes stored inside the Controller. Provided as a hexstring.
     */
    tnglFingerprint: string

    /**
     * Fingerprint identifying the event store state or version. Provided as a hexstring.
     */
    eventStoreFingerprint: string

    /**
     * Fingerprint identifying the configuration state or version. Provided as a hexstring.
     */
    configFingerprint: string
  }
}
