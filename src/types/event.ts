export interface Event {
  debug: string;
  label: string;
  type: number;
  value: any;
  timestamp: number;
  id: number;
}

/**
 * EventStateValue type is equivalent to Event
 * @alias SpectodaEvent
 */
export type EventStateValue = Event;
