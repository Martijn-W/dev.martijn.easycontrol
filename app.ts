'use strict';

import Homey from 'homey';

module.exports = class Ct200App extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('EasyControl app has been initialized');
  }

};
