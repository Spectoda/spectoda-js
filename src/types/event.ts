import { SpectodaTypes } from "./primitives";

import { VALUE_TYPE } from "../constants";

type EventBase = {
  // TODO define type
  debug: string;

  label: SpectodaTypes.Label;

  type: typeof VALUE_TYPE;
  value: any;

  /** When was event emitted */
  timestamp: SpectodaTypes.Timestamp;

  id: SpectodaTypes.ID;
};

type NumberEvent = EventBase & {
  type: typeof VALUE_TYPE.NUMBER;
  value: SpectodaTypes.Number;
};

type LabelEvent = EventBase & {
  type: typeof VALUE_TYPE.LABEL;
  value: SpectodaTypes.Label;
};

type PercentageEvent = EventBase & {
  type: typeof VALUE_TYPE.PERCENTAGE;
  value: SpectodaTypes.Percentage;
};

type TimestampEvent = EventBase & {
  type: typeof VALUE_TYPE.TIME;
  value: SpectodaTypes.Timestamp;
};

type ColorEvent = EventBase & {
  type: typeof VALUE_TYPE.COLOR;
  value: SpectodaTypes.Color;
};

type PixelsEvent = EventBase & {
  type: typeof VALUE_TYPE.PIXELS;
  value: SpectodaTypes.Pixels;
};

type BooleanEvent = EventBase & {
  type: typeof VALUE_TYPE.BOOLEAN;
  value: SpectodaTypes.Boolean;
};

type NullEvent = EventBase & {
  type: typeof VALUE_TYPE.NULL;
  value: SpectodaTypes.Null;
};

type UndefinedEvent = EventBase & {
  type: typeof VALUE_TYPE.UNDEFINED;
  value: SpectodaTypes.Undefined;
};

export type Event = NumberEvent | LabelEvent | PercentageEvent | TimestampEvent | ColorEvent | PixelsEvent | BooleanEvent | NullEvent | UndefinedEvent;

/**
 * EventStateValue type is equivalent to Event
 *
 * @alias Event
 */
export type EventStateValue = Event;
