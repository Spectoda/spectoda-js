const { createSpectodaWebsocket } = require("./SpectodaWebSocketsConnector");

class SpectodaSendersManager {
  constructor() {
    this.senders = [];
  }

  addSender() {
    const sender = createSpectodaWebsocket();
    this.senders.push(sender);
    return sender;
  }

  getSender(index) {
    return this.senders[index];
  }

  castToAll(funcName, ...args) {
    const promises = this.senders.map(sender => {
      if (typeof sender[funcName] === "function") {
        return sender[funcName](...args);
      }
      return Promise.reject(new Error(`Function ${funcName} does not exist on sender`));
    });
    return Promise.all(promises);
  }

  // Any other utility methods you might need...
}

export { SpectodaSendersManager };
