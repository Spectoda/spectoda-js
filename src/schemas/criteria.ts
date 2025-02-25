import { z } from 'zod'

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
    nameprefix: z.string().optional(),
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
