const events = require('events');
const _ = require('lodash');
const ModbusRTU = require('modbus-serial');
const modbusHerdsmanConverters = require('@instathings/modbus-herdsman-converters');

const settings = require('./util/settings');
const logger = require('./util/logger');

class Modbus extends events.EventEmitter {
  constructor(mqtt, device) {
    super();
    this.mqtt = mqtt;
    this.device = device; // {id, model, inteval, modbusId }
    this.client = new ModbusRTU();
    this.descriptor = modbusHerdsmanConverters.findByModbusModel(this.device.model);
  }

  async start() {
    const modbusSettings = settings.get().modbus;
    try {
      const options = {
        baudRate: modbusSettings.baud_rate,
      };
      await this.client.connectRTUBuffered(modbusSettings.port, options);
      await this.client.setID(this.device.modbus_id);
      this.intervalId = setInterval(this.poll.bind(this), this.device.interval);
    } catch (err) {
      logger.error('Error while starting modbus connection');
      throw err;
    }
  }

  async poll() {
    const result = {};
    const keys = Object.keys(this.descriptor.input);
    // eslint-disable-next-line
    for await (let key of keys) {
      const addressDescriptor = _.get(this.descriptor, `input.${key}`);
      const address = _.get(addressDescriptor, 'address');
      let value;
      try {
        value = await this.client.readInputRegisters(address, 1);
        console.log(value);
      } catch (err) {
        console.log('err', err);
        logger.error(err);
      }
      const { post } = addressDescriptor;
      value = _.get(value, 'data[0]');
      value = (post && value) ? post(value) : value;
      _.set(result, key, value);
    }
    const topic = `${settings.get().mqtt.base_topic}/${this.device.id}`;
    const payload = JSON.stringify(result);
    console.log(payload);
    this.mqtt.publish(topic, payload);
  }

  remove() {
    clearInterval(this.intervalId);
  }
}

module.exports = Modbus;