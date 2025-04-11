export const VALUE_TYPES = Object.freeze({
  /** see @link [NumberSchema](../schemas/values.ts) for more details. */
  NUMBER: 29,

  /** see @link [LabelSchema](../schemas/values.ts) for more details. */
  LABEL: 31,

  /** see @link [TimestampSchema](../schemas/values.ts) for more details. */
  TIMESTAMP: 32,

  /** see @link [PercentageSchema](../schemas/values.ts) for more details. */
  PERCENTAGE: 30,

  /** see @link [DateSchema](../schemas/values.ts) for more details. */
  DATE: 28,

  // TODO Add schema
  REAL: 27,

  /** see @link [ColorSchema](../schemas/values.ts) for more details. */
  COLOR: 26,

  /** see @link [PixelsSchema](../schemas/values.ts) for more details. */
  PIXELS: 19,

  /** see @link [BooleanSchema](../schemas/values.ts) for more details. */
  BOOLEAN: 2,

  /** see @link [NullSchema](../schemas/values.ts) for more details. */
  NULL: 1,

  /** see @link [UndefinedSchema](../schemas/values.ts) for more details. */
  UNDEFINED: 0,
})

export const STRING_VALUE_TYPES = Object.freeze({
  /** see @link [NumberSchema](../schemas/values.ts) for more details. */
  NUMBER: 'Value.NUMBER',

  /** see @link [LabelSchema](../schemas/values.ts) for more details. */
  LABEL: 'Value.LABEL',

  /** see @link [TimestampSchema](../schemas/values.ts) for more details. */
  TIMESTAMP: 'Value.TIMESTAMP',

  /** see @link [PercentageSchema](../schemas/values.ts) for more details. */
  PERCENTAGE: 'Value.PERCENTAGE',

  /** see @link [DateSchema](../schemas/values.ts) for more details. */
  DATE: 'Value.DATE',

  /** see @link [ColorSchema](../schemas/values.ts) for more details. */
  COLOR: 'Value.COLOR',

  /** see @link [PixelsSchema](../schemas/values.ts) for more details. */
  PIXELS: 'Value.PIXELS',

  /** see @link [BooleanSchema](../schemas/values.ts) for more details. */
  BOOLEAN: 'Value.BOOLEAN',

  /** see @link [NullSchema](../schemas/values.ts) for more details. */
  NULL: 'Value.NULL',

  /** see @link [UndefinedSchema](../schemas/values.ts) for more details. */
  UNDEFINED: 'Value.UNDEFINED',
})
