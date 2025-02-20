import { z } from 'zod'

// TODO: Add all primitives to the criteria schema and use them here

/**
 * Base criteria for connecting to a Spectoda device
 */
const BaseCriteriaSchema = z
  .object({
    /** Device name */
    name: z.string().optional(),

    /** Name prefix for filtering devices */
    nameprefix: z.string().optional(),

    /** MAC address in format "XX:XX:XX:XX:XX:XX" */
    mac: z
      .string()
      .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/)
      .optional(),

    /** Network signature as 32-char hex string */
    network: z.string().length(32).optional(),

    /** Firmware version in format "X.Y.Z" or "!X.Y.Z" */
    fw: z
      .string()
      .regex(/^!?\d+\.\d+\.\d+$/)
      .optional(),

    /** Product code number */
    product: z.number().int().min(0).max(0xffff).optional(),

    /** Whether device is commissionable */
    commisionable: z.boolean().optional(),

    /** Type of connector */
    connector: z.string().optional(),
  })
  .strict()

/**
 * Serial-specific connection criteria
 */
export const SerialCriteriaSchema = BaseCriteriaSchema.extend({
  /** Serial port path */
  path: z.string().optional(),
  /** Baud rate */
  baudrate: z.number().int().positive().optional(),
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
