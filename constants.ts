export const VALUE_TYPE = {
  TIMESTAMP: 32,
  LABEL: 31,
  PERCENTAGE: 30,
  NUMBER: 29,
  VALUE_ARRAY: 27,
  COLOR: 26,
  TRIPLE: 25,
  PIXELS: 19,
  VALUE_ADDRESS: 18,
  BOOL: 2,
  NULL: 1,
  UNDEFINED: 0,
} as const;

export const BROADCAST_ID = 255;

export const PERCENTAGE_MAX = 268435455; // 2^28-1
export const PERCENTAGE_MIN = -268435455; // -(2^28)+1  (plus 1 is there for the percentage to be simetric)
