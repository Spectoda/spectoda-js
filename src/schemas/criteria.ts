import { z } from 'zod'

import { SpectodaTypes } from '../types/primitives'

import {
  MacAddressSchema,
  NetworkSignatureSchema,
  FirmwareVersionSchema,
  ProductCodeSchema,
  PathSchema,
  BaudrateSchema,
  ControllerNameSchema,
} from './primitives'

/**
 * Base criteria for connecting to a Spectoda device
 */
export const BaseCriteriaSchema = z
  .object({
    name: ControllerNameSchema.optional(),

    // todo @immakermatty add definition for nameprefix
    nameprefix: ControllerNameSchema.optional(),
    mac: MacAddressSchema.optional(),
    network: NetworkSignatureSchema.optional(),
    fw: FirmwareVersionSchema.optional(),
    product: ProductCodeSchema.optional(),
    commisionable: z.boolean().optional(),

    // todo @immakermatty add definition for connector
    connector: z.string().optional(),
  })
  .strict()

/**
 * Serial-specific connection criteria
 */
export const SerialCriteriaSchema = BaseCriteriaSchema.extend({
  path: PathSchema.optional(),
  baudrate: BaudrateSchema.optional(),
})

/**
 * BLE-specific connection criteria
 */
export const BleCriteriaSchema = BaseCriteriaSchema

/**
 * Dummy/simulated connection criteria
 */
export const DummyCriteriaSchema = BaseCriteriaSchema

/**
 * Union of all possible criteria types
 */
export const CriteriaSchema = z.union([SerialCriteriaSchema, BleCriteriaSchema, DummyCriteriaSchema])

/**
 * Single criterion or array of criteria
 */
export const CriteriaArraySchema = z.union([CriteriaSchema, z.array(CriteriaSchema)])

export const isSerialCriteria = (criteria: unknown): criteria is SpectodaTypes.SerialCriteria => {
  return SerialCriteriaSchema.safeParse(criteria).success
}

export const isBleCriteria = (criteria: unknown): criteria is SpectodaTypes.BleCriteria => {
  return BleCriteriaSchema.safeParse(criteria).success
}

export const isDummyCriteria = (criteria: unknown): criteria is SpectodaTypes.DummyCriteria => {
  return DummyCriteriaSchema.safeParse(criteria).success
}

export const isCriteriaArray = (value: unknown): value is SpectodaTypes.Criteria[] => {
  return Array.isArray(value) && value.every((item) => CriteriaSchema.safeParse(item).success)
}
