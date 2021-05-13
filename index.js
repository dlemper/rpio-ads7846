// JS port of https://github.com/watterott/Arduino-Libs/blob/master/ADS7846/ADS7846.cpp

const rpio = require("rpio");

const CMD_START = 0x80;
const CMD_12BIT = 0x00;
const CMD_8BIT = 0x08;
const CMD_DIFF = 0x00;
const CMD_SINGLE = 0x04;
const CMD_X_POS = 0x10;
const CMD_Z1_POS = 0x30;
const CMD_Z2_POS = 0x40;
const CMD_Y_POS = 0x50;
const CMD_PWD = 0x00;
const CMD_ALWAYSON = 0x03;

const MIN_PRESSURE = 5;

module.exports = class Ads7846 {
  constructor(
    rpio,
    { csPin = 26, penirqPin = 22, lcdWidth = 320, lcdHeight = 240 }
  ) {}

  init() {
    //init pins
    rpio.open(csPin, rpio.OUTPUT);
    rpio.spiBegin();
    rpio.spiChipSelect(1);
    rpio.spiSetClockDivider(200);

    rpio.open(penirqPin, rpio.INPUT);
    rpio.write(penirqPin, rpio.HIGH); //pull-up

    //set vars
    tp_matrix.div = 0;
    tp_x = 0;
    tp_y = 0;
    tp_last_x = 0;
    tp_last_y = 0;
    lcd_x = 0;
    lcd_y = 0;
    pressure = 0;

    this.setOrientation(0);
  }

  setOrientation(o) {
    switch (o) {
      default:
      case 0:
        lcd_orientation = 0;
        break;
      case 9:
      case 90:
        lcd_orientation = 90;
        break;
      case 18:
      case 180:
        lcd_orientation = 180;
        break;
      case 27:
      case 14: //270&0xFF
      case 270:
        lcd_orientation = 270;
        break;
    }
  }

  calibrate() {
    let x;
    let y;

    //calc x pos
    if (tp_x != tp_last_x) {
      tp_last_x = tp_x;
      x = tp_x;
      y = tp_y;
      x = (tp_matrix.a * x + tp_matrix.b * y + tp_matrix.c) / tp_matrix.div;

      if (x < 0) {
        x = 0;
      } else if (x >= LCD_WIDTH) {
        x = LCD_WIDTH - 1;
      }

      lcd_x = x;
    }

    //calc y pos
    if (tp_y != tp_last_y) {
      tp_last_y = tp_y;
      x = tp_x;
      y = tp_y;
      y = (tp_matrix.d * x + tp_matrix.e * y + tp_matrix.f) / tp_matrix.div;

      if (y < 0) {
        y = 0;
      } else if (y >= LCD_HEIGHT) {
        y = LCD_HEIGHT - 1;
      }

      lcd_y = y;
    }
  }

  getX() {
    this.calibrate();

    switch (lcd_orientation) {
      case 0:
        return lcd_x;
      case 90:
        return lcd_y;
      case 180:
        return LCD_WIDTH - lcd_x;
      case 270:
        return LCD_HEIGHT - lcd_y;
    }

    return 0;
  }

  getY() {
    this.calibrate();

    switch (lcd_orientation) {
      case 0:
        return lcd_y;
      case 90:
        return LCD_WIDTH - lcd_x;
      case 180:
        return LCD_HEIGHT - lcd_y;
      case 270:
        return lcd_x;
    }

    return 0;
  }

  getXraw() {
    return tp_x;
  }

  getYraw() {
    return tp_y;
  }

  getPressure() {
    return pressure;
  }

  rd_data() {
    let p, a1, a2, b1, b2;
    let x, y;

    //SPI speed-down
    rpio.spiSetClockDivider(200);

    //get pressure
    this.wr_spi(CMD_START | CMD_8BIT | CMD_DIFF | CMD_Z1_POS);
    a1 = this.rd_spi() & 0x7f;
    this.wr_spi(CMD_START | CMD_8BIT | CMD_DIFF | CMD_Z2_POS);
    b1 = (255 - this.rd_spi()) & 0x7f;
    p = a1 + b1;

    if (p > MIN_PRESSURE) {
      //using 2 samples for x and y position

      //get X data
      this.wr_spi(CMD_START | CMD_12BIT | CMD_DIFF | CMD_X_POS);
      a1 = this.rd_spi();
      b1 = this.rd_spi();
      this.wr_spi(CMD_START | CMD_12BIT | CMD_DIFF | CMD_X_POS);
      a2 = this.rd_spi();
      b2 = this.rd_spi();

      if (a1 == a2) {
        x = 1023 - ((a2 << 2) | (b2 >> 6)); //12bit: ((a<<4)|(b>>4)) //10bit: ((a<<2)|(b>>6))

        //get Y data
        this.wr_spi(CMD_START | CMD_12BIT | CMD_DIFF | CMD_Y_POS);
        a1 = this.rd_spi();
        b1 = this.rd_spi();
        this.wr_spi(CMD_START | CMD_12BIT | CMD_DIFF | CMD_Y_POS);
        a2 = this.rd_spi();
        b2 = this.rd_spi();

        if (a1 == a2) {
          y = (a2 << 2) | (b2 >> 6); //12bit: ((a<<4)|(b>>4)) //10bit: ((a<<2)|(b>>6))
          if (x && y) {
            tp_x = x;
            tp_y = y;
          }
          pressure = p;
        }
      }
      CS_DISABLE();
    } else {
      pressure = 0;
    }

    //restore SPI settings
    rpio.spiSetClockDivider(0);

    return;
  }

  rd_spi() {
    const rxBuf = Buffer.alloc(1);
    rpio.spiTransfer(Buffer.from([0x00]), rxBuf, 1);
    return rxBuf.readUInt8();
  }

  wr_spi(data) {
    rpio.spiWrite(Buffer.from([data]));
  }
};
