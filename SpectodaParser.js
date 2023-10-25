import { TnglWriter } from "./TnglWriter.js";
import { mapValue } from "./functions";
import { logging } from "./logging";



// ! must stay this order VAR_VALUE_ADDRESS_OFFSET < CONST_VALUE_ADDRESS_OFFSET < LET_VALUE_ADDRESS_OFFSET
const VAR_VALUE_ADDRESS_OFFSET = 0x0000;
const CONST_VALUE_ADDRESS_OFFSET = 0x4000;
const LET_VALUE_ADDRESS_OFFSET = 0x8000;

const CONSTANTS = Object.freeze({
  MODIFIER_SWITCH_NONE: 0,
  MODIFIER_SWITCH_RG: 1,
  MODIFIER_SWITCH_GB: 2,
  MODIFIER_SWITCH_BR: 3,
});

const TNGL_FLAGS = Object.freeze({
  /* no code or command used by decoder as a validation */
  NONE: 0,

  // ======================

  /* drawings */
  DRAWING_SET: 1,
  DRAWING_ADD: 2,
  DRAWING_SUB: 3,
  DRAWING_SCALE: 4,
  DRAWING_FILTER: 5,

  /* layer operations */
  LAYER_SET: 6,
  LAYER_ADD: 7,
  LAYER_SUB: 8,
  LAYER_SCALE: 9,
  LAYER_FILTER: 10,

  /* frame */
  SCOPE: 11,

  /* clip */
  CLIP: 12,

  /* sifters */
  SIFTER_DEVICE: 13,
  SIFTER_SEGMENT: 14,
  SIFTER_CANVAS: 15,

  /* event handlers */
  INTERACTIVE: 16,
  EVENT_CATCHER: 17,

  /* definitions scoped */
  DECLARE_VALUE_ADDRESS: 18,

  // ======================

  /* definitions global */
  DEFINE_DEVICE: 24,
  DEFINE_SEGMENT: 25,
  DEFINE_CANVAS: 26,
  DEFINE_MARKS: 27,
  DEFINE_EMITTER: 28,
  DEFINE_ANIMATION: 29,

  // ======================

  /* animations */
  ANIMATION_NONE: 32,
  ANIMATION_FILL: 33,
  ANIMATION_RAINBOW: 34,
  ANIMATION_FADE: 35,
  ANIMATION_PROJECTILE: 36,
  ANIMATION_LOADING: 37,
  ANIMATION_COLOR_ROLL: 38,
  ANIMATION_COLOR_GRADIENT3: 39,
  ANIMATION_COLOR_GRADIENT5: 40,
  ANIMATION_COLOR_GRADIENT2: 41,
  ANIMATION_COLOR_GRADIENT4: 42,
  ANIMATION_INL_ANI: 126,
  ANIMATION_DEFINED: 127,

  /* modifiers */
  MODIFIER_BRIGHTNESS: 128,
  MODIFIER_TIMELINE: 129,
  MODIFIER_FADE_IN: 130,
  MODIFIER_FADE_OUT: 131,
  MODIFIER_SWITCH_COLORS: 132,
  MODIFIER_TIME_LOOP: 133,
  MODIFIER_TIME_SCALE: 134,
  MODIFIER_TIME_SCALE_SMOOTHED: 135,
  MODIFIER_TIME_CHANGE: 136,
  MODIFIER_TIME_SET: 137,

  /* events */
  GENERATOR_LAST_EVENT_VALUE: 144,
  GENERATOR_SMOOTHOUT: 145,
  GENERATOR_LAG_VALUE: 146,
  // RESERVED
  GENERATOR_SINE: 150,
  GENERATOR_SAW: 151,
  GENERATOR_TRIANGLE: 152,
  GENERATOR_SQUARE: 153,
  GENERATOR_PERLIN_NOISE: 154,

  /* variable operations gates */
  VALUE_READ_ADDRESS: 160,
  VALUE_ADD: 161,
  VALUE_SUB: 162,
  VALUE_MUL: 163,
  VALUE_DIV: 164,
  VALUE_MOD: 165,
  VALUE_SCALE: 166,
  VALUE_MAP: 167,

  /* objects */
  DEVICE: 176,
  SEGMENT: 177,
  SLICE: 178,
  PORT: 179,
  CANVAS: 180,
  MARKS: 181,
  ID: 182,

  /* events */
  EVENT_SET_VALUE: 184,
  EVENT_EMIT_LOCAL: 185,
  EVENT_RANDOM_CHOICE: 186,

  // ======================

  /* values */
  VALUE_ADDRESS: 187,
  TIMESTAMP: 188,
  COLOR: 189,
  PERCENTAGE: 190,
  LABEL: 191,
  PIXELS: 192,
  TUPLE: 193,
  NUMBER: 205,


  // TODO Operations and Providers should be Object values.
  // OBJECT: ???, // Operations and Providers are objects

  // ======================

  /* most used constants */
  TIMESTAMP_ZERO: 194,
  TIMESTAMP_MAX: 195,
  TIMESTAMP_MIN: 196,
  COLOR_WHITE: 197,
  COLOR_BLACK: 198,
  CONST_PERCENTAGE_ZERO: 199,
  CONST_PERCENTAGE_MAX: 200,
  CONST_PERCENTAGE_MIN: 201,

  // ======================

  /* command ends */
  END_OF_SCOPE: 254,
  END_OF_TNGL_BYTES: 255,
});

const OBJECT_TYPE = Object.freeze({
  // TODO Operations and Providers should be Object values.
  OPERATION_BOOLEAN: 1,
  OPERATION_INTEGER: 2,
  OPERATION_PERCENTAGE: 3,
  OPERATION_PULSE: 4,
  OPERATION_AND: 5,
  OPERATION_COMPARATOR_EQUAL: 6,
  OPERATION_COMPARATOR_GREATER: 7,
  OPERATION_COMPARATOR_LESS: 8,
  OPERATION_COUNTER: 9,
  OPERATION_DELAY_STACK: 10,
  OPERATION_DELAY_OVERWRITE: 11,
  OPERATION_OR: 12,
  OPERATION_REPEATER: 13,
  OPERATION_XOR: 14,
  OPERATION_NEGATE: 15,
  OPERATION_EVENT_RELAY: 16,
  OPERATION_EVENT_TOGGLE: 17,
  OPERATION_IF: 18,
  OPERATION_EVENT_VOID: 19,
  OPERATION_EVENT_STEPPER: 20,
  OPERATION_MODULO: 21,
  OPERATION_EVENT_SET: 22,
  // TODO OPERATIONS and PROVIDERS should be one type of object
  PROVIDER_PROXIMITY: 151,
  PROVIDER_BUTTON: 152,
  PROVIDER_TOUCH: 153,
  PROVIDER_VOLTAGE: 154,
  PROVIDER_PIR: 155,
  PROVIDER_SLIDER: 156,
  PROVIDER_SONOFF_ULTIMATE: 157,
  PROVIDER_NETWORKSYNC: 158,
  PROVIDER_AMBIENT_LIGHT: 159,
  PROVIDER_LUXV30B: 160,
  PROVIDER_VEML7700: 161,
  PROVIDER: 162,

  // TODO OPERATION_CONNECTION should be FLAG in TNGL_FLAGS
  OPERATION_CONNECTION: 253,
});

export class TnglCompiler {
  #tnglWriter;
  #const_declarations_stack;
  #const_scope_depth_stack;
  #let_declarations_stack;
  #let_scope_depth_stack;
  #var_declarations;

  constructor() {
    this.#tnglWriter = new TnglWriter();

    // @type array of {name: "variable", address: 0x0001};
    this.#const_declarations_stack = []; // stack of variable name-address pairs
    // @type array of numers
    this.#const_scope_depth_stack = []; // stack of variable depths in scopes
    // @type array of {name: "variable", address: 0x0001};
    this.#let_declarations_stack = []; // stack of variable name-address pairs
    // @type array of numers
    this.#let_scope_depth_stack = []; // stack of variable depths in scopes
    // @type array of {name: "variable", address: 0x0001};
    this.#var_declarations = []; // addresses starts from 0x0001 to 0xfffe. 0x0000 is a "nullptr", 0xffff is unknown address
  }

  getVariableDeclarations() {
    return this.#var_declarations;
  }

  reset() {
    this.#tnglWriter.reset();

    this.#const_declarations_stack.length = 0;
    this.#const_scope_depth_stack.length = 0;
    this.#let_declarations_stack.length = 0;
    this.#let_scope_depth_stack.length = 0;
    this.#var_declarations.length = 0;
  }

  compileUndefined() {
    this.#tnglWriter.writeUint8(TNGL_FLAGS.NONE);
  }

  compileFlag(flag) {
    this.#tnglWriter.writeUint8(flag);
  }

  compileByte(byte) {
    let reg = byte.match(/0x([0-9a-f][0-9a-f])(?![0-9a-f])/i);
    if (!reg) {
      logging.error("Failed to compile a byte");
      return;
    }
    this.#tnglWriter.writeUint8(parseInt(reg[1], 16));
  }

  compileChar(char) {
    let reg = char.match(/(-?)'([\W\w])'/);
    if (!reg) {
      logging.error("Failed to compile char");
      return;
    }
    if (reg[1] === "-") {
      this.#tnglWriter.writeUint8(-reg[2].charCodeAt(0));
    } else {
      this.#tnglWriter.writeUint8(reg[2].charCodeAt(0));
    }
  }

  // takes string string as '"this is a string"'
  compileString(string) {
    let reg = string.match(/"([\w ]*)"/);
    if (!reg) {
      logging.error("Failed to compile a string");
      return;
    }

    for (let i = 0; i < string.length; i++) {
      this.#tnglWriter.writeUint8(string.charCodeAt(i));
    }

    this.#tnglWriter.writeFlag(TNGL_FLAGS.NONE);
  }

  // // takes template literal string as '`this is a template literal`'
  // compileTemplateLiteral(template_literal) {
  //   throw "Not implemented";
  // }

  compileInfinity(infinity) {
    let reg = infinity.match(/([+-]?Infinity)/);
    if (!reg) {
      logging.error("Failed to compile a infinity");
      return;
    }

    if (reg[1] === "Infinity" || reg[1] === "+Infinity") {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MAX);
    } else if (reg[1] === "-Infinity") {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MIN);
    } else {
      logging.error("Error while compiling infinity");
    }
  }

  compileValueAddress(variable_reference) {
    logging.verbose(`compileValueAddress(${variable_reference})`);

    let reg = variable_reference.match(/&([a-z_][\w]*)/i);
    if (!reg) {
      logging.error("Failed to compile variable address");
      return;
    }

    const variable_name = reg[1];
    let value_address = undefined;

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (let i = this.#const_declarations_stack.length - 1; i >= 0; i--) {
      const declaration = this.#const_declarations_stack[i];
      if (declaration.name === variable_name) {
        value_address = declaration.address;
        break;
      }
    }

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (let i = this.#let_declarations_stack.length - 1; i >= 0; i--) {
      const declaration = this.#let_declarations_stack[i];
      if (declaration.name === variable_name) {
        value_address = declaration.address;
        break;
      }
    }

    // ! there is an issue where variables that have the same name as a const or let variable will be treated as a const or let variable

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (let i = this.#var_declarations.length - 1; i >= 0; i--) {
      const declaration = this.#var_declarations[i];
      if (declaration.name === variable_name) {
        value_address = declaration.address;
        break;
      }
    }

    if (value_address === undefined) {
      logging.error(`Variable ${variable_name} is not declated`);
      throw "CompilationError";
    }

    logging.verbose(`VALUE_ADDRESS name=${variable_name}, address=${value_address}`);
    this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_ADDRESS);
    this.#tnglWriter.writeUint16(value_address);
  }

  // takes in time string token like "1.2d+9h2m7.2s-123t" and appeds to payload the total time in ms (tics) as a int32_t: [FLAG.TIMESTAMP, BYTE4, BYTE2, BYTE1, BYTE0]
  compileTimestamp(value) {
    // logging.debug(timestamp);

    // timestamp = timestamp.replace(/_/g, ""); // replaces all '_' with nothing

    // let total_tics = 0;

    // while (timestamp) {
    //   let reg = timestamp.match(/([+-]?[0-9]*[.]?[0-9]+)(d|h|m|s|ms)/i); // for example gets "-1.4d" from "-1.4d23.2m1s"

    //   if (!reg) {
    //     // if the regex match failes, then the algorithm is done
    //     if (timestamp != "") {
    //       logging.error("Error while parsing timestamp");
    //       logging.debug("Leftover string:", timestamp);
    //     }
    //     break;
    //   }

    //   let value = reg[0]; // gets "-1.4d" from "-1.4d"
    //   let number = parseFloat(reg[1]); // gets "-1.4" from "-1.4d"
    //   let unit = reg[2]; // gets "d" from "-1.4d"

    //   logging.debug(`value: ${value}, unit: ${unit}, number: ${number}`);

    //   switch (unit) {
    //     case "d":
    //       total_tics += number * 86400000;
    //       break;

    //     case "h":
    //       total_tics += number * 3600000;
    //       break;

    //     case "m":
    //       total_tics += number * 60000;
    //       break;

    //     case "s":
    //       total_tics += number * 1000;
    //       break;

    //     case "t":
    //       total_tics += number;
    //       break;

    //     default:
    //       logging.error("Error while parsing timestamp");
    //       break;
    //   }

    //   timestamp = timestamp.replace(value, ""); // removes one value from the string
    // }

    // if (total_tics === 0) {
    //   this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_ZERO);
    // } else {
    //   this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP);
    //   this.#tnglWriter.writeInt32(total_tics);
    // }

    ///////////////////////////////

    if (!value) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_ZERO);
      return;
    }

    value = value.trim();

    if (value == "inf" || value == "Inf" || value == "infinity" || value == "Infinity") {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MAX);
      return;
    }

    if (value == "-inf" || value == "-Inf" || value == "-infinity" || value == "-Infinity") {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MIN);
      return;
    }

    // if the value is a number
    if (!isNaN(value)) {
      value += "s";
    }

    let days = value.match(/([+-]?[0-9]+[.]?[0-9]*|[.][0-9]+)\s*d/gi);
    let hours = value.match(/([+-]?[0-9]+[.]?[0-9]*|[.][0-9]+)\s*h/gi);
    let minutes = value.match(/([+-]?[0-9]+[.]?[0-9]*|[.][0-9]+)\s*m(?!s)/gi);
    let secs = value.match(/([+-]?[0-9]+[.]?[0-9]*|[.][0-9]+)\s*s/gi);
    let msecs = value.match(/([+-]?[0-9]+[.]?[0-9]*|[.][0-9]+)\s*(t|ms)/gi);

    // console.log(days);
    // console.log(hours);
    // console.log(minutes);
    // console.log(secs);
    // console.log(msecs);

    let total = 0;

    while (days && days.length) {
      let d = parseFloat(days[0]);
      total += d * 86400000;
      days.shift();
    }

    while (hours && hours.length) {
      let h = parseFloat(hours[0]);
      total += h * 3600000;
      hours.shift();
    }

    while (minutes && minutes.length) {
      let m = parseFloat(minutes[0]);
      total += m * 60000;
      minutes.shift();
    }

    while (secs && secs.length) {
      let s = parseFloat(secs[0]);
      total += s * 1000;
      secs.shift();
    }

    while (msecs && msecs.length) {
      let ms = parseFloat(msecs[0]);
      total += ms;
      msecs.shift();
    }

    // logging.verbose(`total=${total}`);

    if (total >= 2147483647) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MAX);
      return;
    } else if (total <= -2147483648) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_MIN);
      return;
    } else if (total === 0) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP_ZERO);
      return;
    } else {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.TIMESTAMP);
      this.#tnglWriter.writeInt32(total);
      return;
    }
  }

  // takes in html color string "#abcdef" and encodes it into 24 bits [FLAG.COLOR, R, G, B]
  compileColor(color) {
    let reg = color.match(/#([0-9a-f][0-9a-f])([0-9a-f][0-9a-f])([0-9a-f][0-9a-f])/i);
    if (!reg) {
      logging.error("Failed to compile color");
      return;
    }

    let r = parseInt(reg[1], 16);
    let g = parseInt(reg[2], 16);
    let b = parseInt(reg[3], 16);

    if (r === 255 && g === 255 && b === 255) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.COLOR_WHITE);
    } else if (r === 0 && g === 0 && b === 0) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.COLOR_BLACK);
    } else {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.COLOR);
      this.#tnglWriter.writeUint8(r);
      this.#tnglWriter.writeUint8(g);
      this.#tnglWriter.writeUint8(b);
    }
  }

  // takes in percentage string "83.234%" and encodes it into 24 bits
  compilePercentage(percentage) {
    let reg = percentage.match(/([+-]?[\d.]+)%/);
    if (!reg) {
      logging.error("Failed to compile percentage");
      return;
    }

    let val = parseFloat(reg[1]);

    if (val > 100.0) {
      val = 100.0;
    }
    if (val < -100.0) {
      val = -100.0;
    }

    // TODO move constants to one file
    const PERCENTAGE_MAX = 268435455; // 2^28-1
    const PERCENTAGE_MIN = -268435455; // -(2^28)+1  (plus 1 is there for the percentage to be simetric)

    // percentage has 29 bits of resolution dividing range from -100.0 to 100.0
    const UNIT_ERROR = (100.0 - -100.0) / 2 ** 29;

    if (val > -UNIT_ERROR && val < UNIT_ERROR) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.CONST_PERCENTAGE_ZERO);
    } else if (val > 100.0 - UNIT_ERROR) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.CONST_PERCENTAGE_MAX);
    } else if (val < -100.0 + UNIT_ERROR) {
      this.#tnglWriter.writeFlag(TNGL_FLAGS.CONST_PERCENTAGE_MIN);
    } else {
      const remapped = mapValue(val, -100.0, 100.0, PERCENTAGE_MIN, PERCENTAGE_MAX);
      this.#tnglWriter.writeFlag(TNGL_FLAGS.PERCENTAGE);
      this.#tnglWriter.writeInt32(parseInt(remapped));
    }
  }

  // takes label string as "$label" and encodes it into 32 bits
  compileLabel(label) {
    let reg = label.match(/\$([\w]*)/);
    if (!reg) {
      logging.error("Failed to compile a label");
      return;
    }

    this.#tnglWriter.writeFlag(TNGL_FLAGS.LABEL);
    for (let index = 0; index < 5; index++) {
      this.#tnglWriter.writeUint8(reg[1].charCodeAt(index));
    }
  }

  // takes pixels string "12px" and encodes it into 16 bits
  compilePixels(pixels) {
    let reg = pixels.match(/(-?[\d]+)px/);
    if (!reg) {
      logging.error("Failed to compile pixels");
      return;
    }

    let count = parseInt(reg[1]);

    this.#tnglWriter.writeFlag(TNGL_FLAGS.PIXELS);
    this.#tnglWriter.writeInt16(count);
  }

  ///////////////////////////////////////////////////////////

  compileConstDeclaration(variable_declaration) {
    logging.verbose(`compileConstDeclaration("${variable_declaration}")`);

    let reg = variable_declaration.match(/const +([A-Za-z_][\w]*) *=/);
    if (!reg) {
      logging.error("Failed to compile const declaration");
      return;
    }

    const const_name = reg[1];
    const const_address = CONST_VALUE_ADDRESS_OFFSET + this.#const_declarations_stack.length + 1;

    this.#const_declarations_stack.push({ name: const_name, address: const_address });

    logging.verbose(`DECLARE_VALUE_ADDRESS name=${const_name} address=${const_address}`);
    // retrieve the const_address and write the TNGL_FLAGS with uint16_t variable address value.
    this.#tnglWriter.writeFlag(TNGL_FLAGS.DECLARE_VALUE_ADDRESS);
    this.#tnglWriter.writeUint16(const_address);
  }

  compileLetDeclaration(variable_declaration) {
    logging.verbose(`compileLetDeclaration(${variable_declaration})`);

    let reg = variable_declaration.match(/let +([A-Za-z_][\w]*) *=/);
    if (!reg) {
      logging.error("Failed to compile let declaration");
      return;
    }

    const let_name = reg[1];
    const let_address = LET_VALUE_ADDRESS_OFFSET + this.#let_declarations_stack.length + 1;

    this.#let_declarations_stack.push({ name: let_name, address: let_address });

    logging.verbose(`DECLARE_VALUE_ADDRESS name=${let_name} address=${let_address}`);
    // retrieve the let_address and write the TNGL_FLAGS with uint16_t variable address value.
    this.#tnglWriter.writeFlag(TNGL_FLAGS.DECLARE_VALUE_ADDRESS);
    this.#tnglWriter.writeUint16(let_address);
  }

  compileVarDeclaration(variable_declaration) {
    logging.verbose(`compileVarDeclaration(${variable_declaration})`);

    let reg = variable_declaration.match(/var +([A-Za-z_][\w]*) *=/);
    if (!reg) {
      logging.error("Failed to compile var declaration");
      return;
    }

    const var_name = reg[1];
    const var_address = VAR_VALUE_ADDRESS_OFFSET + this.#var_declarations.length + 1;
    //? const var_address = VAR_VALUE_ADDRESS_OFFSET + Object.keys(this.#var_declarations).length + 1;

    // insert the var_name into var_name->var_address map
    this.#var_declarations.push({ name: var_name, address: var_address });
    //? this.#var_declarations[var_name] = var_address;

    logging.verbose(`DECLARE_VALUE_ADDRESS name=${var_name} address=${var_address}`);
    // retrieve the var_address and write the TNGL_FLAGS with uint16_t variable address value.
    this.#tnglWriter.writeFlag(TNGL_FLAGS.DECLARE_VALUE_ADDRESS);
    this.#tnglWriter.writeUint16(var_address);
  }

  compileWord(word) {
    switch (word) {
      // === canvas operations ===
      case "setDrawing":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DRAWING_SET);
        break;
      case "addDrawing":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DRAWING_ADD);
        break;
      case "subDrawing":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DRAWING_SUB);
        break;
      case "scaDrawing":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DRAWING_SCALE);
        break;
      case "filDrawing":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DRAWING_FILTER);
        break;
      case "setLayer":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.LAYER_SET);
        break;
      case "addLayer":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.LAYER_ADD);
        break;
      case "subLayer":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.LAYER_SUB);
        break;
      case "scaLayer":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.LAYER_SCALE);
        break;
      case "filLayer":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.LAYER_FILTER);
        break;

      // === scopes ===
      case "scope":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.SCOPE);
        break;

      // === animations ===
      case "animation":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_DEFINED);
        break;
      case "animNone":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_NONE);
        break;
      case "animFill":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_FILL);
        break;
      case "animRainbow":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_RAINBOW);
        break;
      case "animPlasmaShot":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_PROJECTILE);
        break;
      case "animLoadingBar":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_LOADING);
        break;
      case "animFade":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_FADE);
        break;
      case "animColorRoll":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_COLOR_ROLL);
        break;
      // case "animPaletteRoll":
      //   this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_PALLETTE_ROLL);
      //   break;
      case "animColorGradient2":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_COLOR_GRADIENT2);
        break;
      case "animColorGradient3":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_COLOR_GRADIENT3);
        break;
      case "animColorGradient4":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_COLOR_GRADIENT4);
        break;
      case "animColorGradient5":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ANIMATION_COLOR_GRADIENT5);
        break;

      // === handlers ===
      case "interactive":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.INTERACTIVE);
        break;

      // === clip ===
      case "clip":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.CLIP);
        break;

      // === definitions ===
      case "defAnimation":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEFINE_ANIMATION);
        break;
      case "defDevice":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEFINE_DEVICE);
        break;
      case "defSegment":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEFINE_SEGMENT);
        break;
      case "defCanvas":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEFINE_CANVAS);
        break;
      case "defMarks":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEFINE_MARKS);
        break;
      // case "defVariable":
      //   this.#tnglWriter.writeFlag(TNGL_FLAGS.DECLARE_VALUE_ADDRESS);
      //   break;

      // === sifters ===
      // case "siftDevices":
      //   this.#tnglWriter.writeFlag(TNGL_FLAGS.SIFTER_DEVICE);
      //   break;
      case "siftSegments":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.SIFTER_SEGMENT);
        break;
      case "siftCanvases":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.SIFTER_CANVAS);
        break;

      // === objects ===
      case "device":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.DEVICE);
        break;
      case "segment":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.SEGMENT);
        break;
      case "slice":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.SLICE);
        break;
      case "port":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.PORT);
        break;
      case "canvas":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.CANVAS);
        break;
      case "marks":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MARKS);
        break;
      case "id":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.ID);
        break;

      // === modifiers ===
      case "modifyBrightness":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_BRIGHTNESS);
        break;
      case "modifyTimeline":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIMELINE);
        break;
      case "modifyFadeIn":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_FADE_IN);
        break;
      case "modifyFadeOut":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_FADE_OUT);
        break;
      case "modifyColorSwitch":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_SWITCH_COLORS);
        break;
      case "modifyTimeLoop":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIME_LOOP);
        break;
      case "modifyTimeScale":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIME_SCALE);
        break;
      case "modifyTimeScaleSmoothed":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIME_SCALE_SMOOTHED);
        break;
      case "modifyTimeChange":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIME_CHANGE);
        break;
      case "modifyTimeSet":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.MODIFIER_TIME_SET);
        break;

      // === events ===
      case "catchEvent":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.EVENT_CATCHER);
        break;
      case "setValue":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.EVENT_SET_VALUE);
        break;
      case "emitAs":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.EVENT_EMIT_LOCAL);
        break;
      case "randomChoice":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.EVENT_RANDOM_CHOICE);
        break;

      // === generators ===
      case "genLastEventParam":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_LAST_EVENT_VALUE);
        break;
      case "genSine":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_SINE);
        break;
      case "genSaw":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_SAW);
        break;
      case "genTriangle":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_TRIANGLE);
        break;
      case "genSquare":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_SQUARE);
        break;
      case "genPerlinNoise":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_PERLIN_NOISE);
        break;
      case "genSmoothOut":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_SMOOTHOUT);
        break;
      case "genLagValue":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.GENERATOR_LAG_VALUE);
        break;

      /* === variable operations === */

      case "addValues":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_ADD);
        break;
      case "subValues":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_SUB);
        break;
      case "mulValues":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_MUL);
        break;
      case "divValues":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_DIV);
        break;
      case "modValues":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_MOD);
        break;
      case "scaValue":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_SCALE);
        break;
      case "mapValue":
        this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_MAP);
        break;

      // === constants ===
      case "true":
        this.#tnglWriter.writeUint8(0x01);
        break;
      case "false":
        this.#tnglWriter.writeUint8(0x00);
        break;

      case "MODIFIER_SWITCH_NONE":
        this.#tnglWriter.writeUint8(CONSTANTS.MODIFIER_SWITCH_NONE);
        break;
      case "MODIFIER_SWITCH_RG":
      case "MODIFIER_SWITCH_GR":
        this.#tnglWriter.writeUint8(CONSTANTS.MODIFIER_SWITCH_RG);
        break;
      case "MODIFIER_SWITCH_GB":
      case "MODIFIER_SWITCH_BG":
        this.#tnglWriter.writeUint8(CONSTANTS.MODIFIER_SWITCH_GB);
        break;
      case "MODIFIER_SWITCH_BR":
      case "MODIFIER_SWITCH_RB":
        this.#tnglWriter.writeUint8(CONSTANTS.MODIFIER_SWITCH_BR);
        break;

      // === Sensors ===
      case "TouchProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_TOUCH);
        break;

      case "ButtonProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_BUTTON);
        break;

      case "ProximityProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_PROXIMITY);
        break;

      case "Boolean":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_BOOLEAN);
        break;

      case "Integer":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_INTEGER);
        break;

      case "Percentage":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_PERCENTAGE);
        break;

      case "Pulse":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_PULSE);
        break;

      case "And":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_AND);
        break;

      case "ComparatorEqual":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_COMPARATOR_EQUAL);
        break;

      case "ComparatorGreater":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_COMPARATOR_GREATER);
        break;

      case "ComparatorLess":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_COMPARATOR_LESS);
        break;

      case "Counter":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_COUNTER);
        break;

      case "DelayStack":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_DELAY_STACK);
        break;

      case "DelayOverwrite":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_DELAY_OVERWRITE);
        break;

      case "Or":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_OR);
        break;

      case "Repeater":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_REPEATER);
        break;

      case "Xor":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_XOR);
        break;

      case "Negate":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_NEGATE);
        break;

      case "EventRelay":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_EVENT_RELAY);
        break;

      case "EventToggle":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_EVENT_TOGGLE);
        break;

      case "If":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_IF);
        break;

      case "VoltageProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_VOLTAGE);
        break;

      case "PIRProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_PIR);
        break;

      case "SliderProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_SLIDER);
        break;

      case "EventVoid":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_EVENT_VOID);
        break;

      case "EventStepper":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_EVENT_STEPPER);
        break;

      case "Modulo":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_MODULO);
        break;

      case "SonoffUltimateProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_SONOFF_ULTIMATE);
        break;

      case "EventSet":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_EVENT_SET);
        break;

      case "NetworkSyncProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_NETWORKSYNC);
        break;

      case "AmbientLightProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_AMBIENT_LIGHT);
        break;

      case "LUXv30BProvider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_LUXV30B);
        break;

      case "VEML7700Provider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER_VEML7700);
        break;

      case "Provider":
        this.#tnglWriter.writeFlag(OBJECT_TYPE.PROVIDER);
        break;

      default:
        // TODO look for variable_name in the variable_name->value_address map

        let var_address = undefined;

        // check if the variable is already declared
        // look for the latest variable address on the stack
        for (let i = this.#var_declarations.length - 1; i >= 0; i--) {
          const declaration = this.#var_declarations[i];
          if (declaration.name === word) {
            var_address = declaration.address;
            break;
          }
        }

        //? var_address = this.#var_declarations[word];

        if (var_address !== undefined) {
          logging.verbose(`VALUE_READ_ADDRESS name=${word}, address=${var_address}`);
          this.#tnglWriter.writeFlag(TNGL_FLAGS.VALUE_READ_ADDRESS);
          this.#tnglWriter.writeUint16(var_address);
          break;
        }

        // === unknown ===
        logging.warn("Unknown word >", word, "<");
        break;
    }
  }

  compilePunctuation(puctuation) {
    switch (puctuation) {
      case "{":
        // push the current depth of the variable stack to the depth stack
        this.#const_scope_depth_stack.push(this.#const_declarations_stack.length);
        this.#let_scope_depth_stack.push(this.#let_declarations_stack.length);
        break;

      case "}":
        // pop the scope depth of the depth stack variable stack and set the variable stack to the previous depth
        const const_depth = this.#const_scope_depth_stack.pop();
        this.#const_declarations_stack.length = const_depth;
        const let_depth = this.#let_scope_depth_stack.pop();
        this.#let_declarations_stack.length = let_depth;

        this.#tnglWriter.writeFlag(TNGL_FLAGS.END_OF_SCOPE);
        break;

      default:
        break;
    }
  }

  compileConnection(connection) {
    // connection is in this format:
    // origin->[0x00]destination
    // using regex, we can split the connection into 3 parts:
    // origin -> [0x00] -> destination
    const regex = /([a-zA-Z0-9_]+)->\[0x([0-9a-fA-F]+)\]([a-zA-Z0-9_]+)/;

    const match = connection.match(regex);
    if (match === null) {
      logging.error("Failed to compile connection");
      return;
    }

    const origin = match[1];
    const destination = match[3];
    const pin = parseInt(match[2], 16);

    // find the variable address
    let origin_value_address = undefined;
    let destination_variable_address = undefined;

    // check if the variable is already declared
    // look for the latest variable address on the stack
    for (let i = this.#const_declarations_stack.length - 1; i >= 0; i--) {
      const declaration = this.#const_declarations_stack[i];
      if (!origin_value_address && declaration.name === origin) {
        origin_value_address = declaration.address;
      }
      if (!destination_variable_address && declaration.name === destination) {
        destination_variable_address = declaration.address;
      }
      if (origin_value_address && destination_variable_address) {
        break;
      }
    }

    // TODO Theory: if the variable is not found in the const stack, it must be in the let stack or var stack?

    if (origin_value_address === undefined) {
      logging.error(`Failed to find origin variable address [${origin}]`);
      return;
    }

    if (destination_variable_address === undefined) {
      logging.error(`Failed to find destination variable address [${destination}]`);
      return;
    }

    this.#tnglWriter.writeFlag(OBJECT_TYPE.OPERATION_CONNECTION);
    this.#tnglWriter.writeUint16(origin_value_address);
    this.#tnglWriter.writeUint16(destination_variable_address);
    this.#tnglWriter.writeUint8(pin);
  }
  // number_t, 3 bytes, max: 16777215
  compileNumber(number) {
    let bytes = new Uint8Array(3);

    // msb
    bytes[0] = (number >> 16) & 0xff;

    // msbl
    bytes[1] = (number >> 8) & 0xff;

    // lsb
    bytes[2] = number & 0xff;

    this.#tnglWriter.writeFlag(TNGL_FLAGS.NUMBER);
    bytes.forEach((byte) => { this.#tnglWriter.writeUint8(byte); });
  }

  get tnglBytes() {
    return new Uint8Array(this.#tnglWriter.bytes.buffer, 0, this.#tnglWriter.written);
  }
}

export class TnglCodeParser {
  #compiler;
  constructor() {
    this.#compiler = new TnglCompiler();
  }

  parseTnglCode(tngl_code) {
    logging.verbose(tngl_code);

    this.#compiler.reset();

    // 1nd stage: tokenize the code

    const tokens = this.#tokenize(tngl_code, TnglCodeParser.#parses);
    logging.verbose(tokens);

    // 2rd stage: compile the code

    for (let index = 0; index < tokens.length; index++) {
      const element = tokens[index];

      // logging.debug(element);

      switch (element.type) {

        case "connection":
          this.#compiler.compileConnection(element.token);
          break;

        case "undefined":
          this.#compiler.compileUndefined();
          break;

        case "const_declaration":
          this.#compiler.compileConstDeclaration(element.token);
          break;

        case "var_declaration":
          this.#compiler.compileVarDeclaration(element.token);
          break;

        case "comment":
          // skip
          break;

        case "htmlrgb":
          this.#compiler.compileColor(element.token);
          break;

        case "infinity":
          this.#compiler.compileInfinity(element.token);
          break;

        case "string":
          this.#compiler.compileString(element.token);
          break;

        // case "template_literal":
        //   this.#compiler.compileTemplateLiteral(element.token);
        //   break;

        case "value_address":
          this.#compiler.compileValueAddress(element.token);
          break;

        case "timestamp":
          this.#compiler.compileTimestamp(element.token);
          break;

        case "label":
          this.#compiler.compileLabel(element.token);
          break;

        case "char":
          this.#compiler.compileChar(element.token);
          break;

        case "byte":
          this.#compiler.compileByte(element.token);
          break;

        case "pixels":
          this.#compiler.compilePixels(element.token);
          break;

        case "percentage":
          this.#compiler.compilePercentage(element.token);
          break;

        case "float":
          logging.error('"Naked" float numbers are not permitted.');
          break;

        case "number":
          this.#compiler.compileNumber(element.token);
          break;

        case "word":
          this.#compiler.compileWord(element.token);
          break;

        case "whitespace":
          // skip
          break;

        case "punctuation":
          this.#compiler.compilePunctuation(element.token);
          break;

        default:
          logging.warn("Unknown token type >", element.type, "<");
          break;
      }
    }

    this.#compiler.compileFlag(TNGL_FLAGS.END_OF_TNGL_BYTES);

    let tnglBytes = this.#compiler.tnglBytes;

    logging.verbose(tnglBytes);
    // logging.debug(uint8ArrayToHexString(tnglBytes));
    logging.info("Compiled tnglbytes length:", tnglBytes.length);
    return tnglBytes;
  }

  static #parses = {
    connection: /[\w]+->\[\w*\][\w]+\s*;/,
    undefined: /undefined/,
    var_declaration: /var +[A-Za-z_][\w]* *=/,
    const_declaration: /const +[A-Za-z_][\w]* *=/,
    comment: /\/\/[^\n]*/,
    htmlrgb: /#[0-9a-f]{6}/i,
    infinity: /[+-]?Infinity/,
    string: /"[\w ]*"/,
    // template_literal: /`([^`]*)`/s,
    value_address: /&[a-z_][\w]*/i,
    timestamp: /(_?[+-]?[0-9]*[.]?[0-9]+(d|h|m(?!s)|s|t|ms))+/,
    label: /\$[\w]*/,
    char: /-?'[\W\w]'/,
    byte: /0x[0-9a-f][0-9a-f](?![0-9a-f])/i,
    pixels: /-?[\d]+px/,
    percentage: /[+-]?[\d.]+%/,
    float: /([+-]?[0-9]*[.][0-9]+)/,
    number: /([+-]?[0-9]+)/,
    word: /[a-z_][\w]*/i,
    whitespace: /\s+/,
    punctuation: /[^\w\s]/,
  };

  getVariableDeclarations() {
    return this.#compiler.getVariableDeclarations();
  }


  /*
   * Tiny tokenizer
   *
   * - Accepts a subject string and an object of regular expressions for parsing
   * - Returns an array of token objects
   *
   * tokenize('this is text.', { word:/\w+/, whitespace:/\s+/, punctuation:/[^\w\s]/ }, 'invalid');
   * result => [{ token="this", type="word" },{ token=" ", type="whitespace" }, Object { token="is", type="word" }, ... ]
   *
   */

  #tokenize(s, parsers, deftok) {
    var m,
      r,
      l,
      cnt,
      t,
      tokens = [];
    while (s) {
      t = null;
      m = s.length;
      for (var key in parsers) {
        r = parsers[key].exec(s);
        // try to choose the best match if there are several
        // where "best" is the closest to the current starting point
        if (r && r.index < m) {
          t = {
            token: r[0],
            type: key,
            matches: r.slice(1),
          };
          m = r.index;
        }
      }
      if (m) {
        // there is text between last token and currently
        // matched token - push that out as default or "unknown"
        tokens.push({
          token: s.substr(0, m),
          type: deftok || "unknown",
        });
      }
      if (t) {
        // push current token onto sequence
        tokens.push(t);
      }
      s = s.substr(m + (t ? t.token.length : 0));
    }
    return tokens;
  }
}
