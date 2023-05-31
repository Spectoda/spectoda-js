export class TnglReader {
  constructor(dataView) {
    this._dataView = dataView;
    this._index = 0;
  }

  // TODO optimize this function 
  peekValue(byteCount, unsigned) {
    const masks = [0x00n, 0x80n, 0x8000n, 0x800000n, 0x80000000n];
    const offsets = [0x00n, 0x100n, 0x10000n, 0x1000000n, 0x100000000n];
  
    if (this._index + byteCount > this._dataView.byteLength) {
      console.error("End of the data");
      throw "PeekOutOfRange";
    }
  
    let value = 0n;
    for (let i = byteCount; i > 0; i--) {
      value <<= 8n;
      value |= BigInt(this._dataView.getUint8(this._index + i - 1));
    }
  
    if (unsigned) {
      return Number(value);
    } else {
      if (byteCount < 4) {
        if ((value & masks[byteCount]) != 0n) {
          return Number(value - offsets[byteCount]);
        }
      } else {
        return Number(value);
      }
    }
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
