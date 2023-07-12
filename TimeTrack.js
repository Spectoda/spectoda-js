import { createNanoEvents } from "./functions";

export class TimeTrack {
  constructor(timestamp, paused) {
    this.memory_ = 0;
    this.paused_ = false;

    this.eventEmitter_ = createNanoEvents();

    if (paused) {
      this.pause();
    }

    if (timestamp) {
      this.setMillis(timestamp);
    } else {
      this.setMillis(0);
    }
  }

  millis() {
    if (this.paused_) {
      return this.memory_;
    } else {
      return Date.now() - this.memory_;
    }
  }

  setState(current_timestamp, paused) {
    if ((paused && !this.paused_) || (!paused && this.paused_)) {
      this.paused_ = paused;
      this.memory_ = Date.now() - this.memory_;
    }

    this.memory_ = this.paused_ ? current_timestamp : Date.now() - current_timestamp;
    this.eventEmitter_.emit("change", { target: this });
    // TODO implement event handlers
  }

  setMillis(current_timestamp) {
    this.memory_ = this.paused_ ? current_timestamp : Date.now() - current_timestamp;
    this.eventEmitter_.emit("change", { target: this });

    this.eventEmitter_.emit("millis", current_timestamp);
  }

  pause() {
    if (!this.paused_) {
      this.paused_ = true;
      this.memory_ = Date.now() - this.memory_;
      this.eventEmitter_.emit("change", { target: this });
    }
    this.eventEmitter_.emit("pause");
  }

  unpause() {
    if (this.paused_) {
      this.paused_ = false;
      this.memory_ = Date.now() - this.memory_;
      this.eventEmitter_.emit("change", { target: this });
    }
    this.eventEmitter_.emit("play");
  }

  paused() {
    return this.paused_;
  }

  on() {
    return this.eventEmitter_.on.apply(this.eventEmitter_, arguments);
  }
}
