import Homey from 'homey';

module.exports = class extends Homey.Driver {

  async onInit() {
    this.log('EasyControl driver has been initialized');
  }

  async onPairListDevices() {
    return [];
  }

};
