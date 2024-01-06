requestWakeLock(prioritized = false) {
  logging.debug("> Activating wakeLock...");

  if (prioritized) {
    this.#isPrioritizedWakelock = true;
  }

  try {
    if (detectNode()) {
      // NOP
    } else if (detectSpectodaConnect()) {
      window.flutter_inappwebview.callHandler("setWakeLock", true);
    } else {
      navigator.wakeLock
        .request("screen")
        .then(Wakelock => {
          logging.info("Web Wakelock activated.");
          this.#wakeLock = Wakelock;
        })
        .catch(() => {
          logging.warn("Web Wakelock activation failed.");
        });
    }
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

releaseWakeLock(prioritized = false) {
  logging.debug("> Deactivating wakeLock...");

  if (prioritized) {
    this.#isPrioritizedWakelock = false;
  } else if (this.#isPrioritizedWakelock) {
    return Promise.resolve();
  }

  try {
    if (detectNode()) {
      // NOP
    } else if (detectSpectodaConnect()) {
      window.flutter_inappwebview.callHandler("setWakeLock", false);
    } else {
      this.#wakeLock
        ?.release()
        .then(() => {
          logging.info("Web Wakelock deactivated.");
          this.#wakeLock = null;
        })
        .catch(() => {
          logging.warn("Web Wakelock deactivation failed.");
        });
    }
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}