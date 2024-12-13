'use strict';

import Homey from 'homey';

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const setTemperatureCard = this.homey.flow.getActionCard('set-temperature');
    setTemperatureCard.registerRunListener(async () => {
      this.log('hello there, you want to set a temperature');
    });

    this.log('MyApp has been initialized');
  }

};
