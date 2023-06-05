export class TnglReader {
  constructor(dataView) {
    this._dataView = dataView;
    this._index = 0;
  }

  // TODO optimize and test this function 
  peekValue(byteCount, unsigned = true) {

    if (byteCount > 8) {
      console.error("Byte count is too big");
      throw new RangeError("ByteCountOutOfRange");
    }

    if (this._index + byteCount > this._dataView.byteLength) {
      console.error("End of the data");
      throw new RangeError("PeekOutOfRange");
    }

    let value = 0n;
    for (let i = byteCount; i > 0; i--) {
      value <<= 8n;
      value |= BigInt(this._dataView.getUint8(this._index + i - 1));
    }

    let result = value;

    if (!unsigned && (value & (1n << (BigInt(byteCount * 8) - 1n)))) {
      // Two's complement conversion
      result = value - (1n << BigInt(byteCount * 8));
    }

    if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
      console.error("Value is outside of safe integer range");
      // TODO handle this error better than loosing precision in conversion to Number
    }

    return Number(result);
  }

  readValue(byteCount, unsigned) {
    try {
      const val = this.peekValue(byteCount, unsigned);
      this.forward(byteCount);
      return val;
    } catch {
      throw "ReadOutOfRange";
    }
  }

  readBytes(byteCount) {
    if (this._index + byteCount <= this._dataView.byteLength) {
      let bytes = [];

      for (let i = 0; i < byteCount; i++) {
        bytes.push(this._dataView.getUint8(this._index + i));
      }

      this.forward(byteCount);

      return bytes;
    } else {
      console.error("End of the data");
      throw "Bytes read out of range";
    }
  }

  readString(bufferLength) {
    if (this._index + bufferLength <= this._dataView.byteLength) {
      let string = "";
      let endOfTheString = false;

      for (let i = 0; i < bufferLength; i++) {
        let charCode = this._dataView.getUint8(this._index + i);
        if (charCode === 0) {
          endOfTheString = true;
        }
        if (!endOfTheString) {
          string += String.fromCharCode(charCode);
        }
      }

      return string;
    } else {
      console.warn("End of the data");
      throw "Bytes read out of range";
    }
  }

  peekFlag() {
    return this.peekValue(1, true);
  }

  readFlag() {
    return this.readValue(1, true);
  }

  readInt8() {
    return this.readValue(1, false);
  }

  readUint8() {
    return this.readValue(1, true);
  }

  readInt16() {
    return this.readValue(2, false);
  }

  readUint16() {
    return this.readValue(2, true);
  }

  readInt32() {
    return this.readValue(4, false);
  }

  readUint32() {
    return this.readValue(4, true);
  }

  readInt48() {
    return this.readValue(6, false);
  }

  readUint48() {
    return this.readValue(6, true);
  }

  readInt64() {
    return this.readValue(8, false);
  }

  readUint64() {
    return this.readValue(8, true);
  }

  get available() {
    return this._dataView.byteLength - this._index;
  }

  forward(byteCount) {
    if (this._index + byteCount <= this._dataView.byteLength) {
      this._index += byteCount;
    } else {
      this._index = this._dataView.byteLength;
    }
  }

  back(byteCount) {
    if (this._index >= byteCount) {
      this._index -= byteCount;
    } else {
      this._index = 0;
    }
  }
}
