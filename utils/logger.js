export class Logger {
  static info(message) {
    console.log(`ℹ️ ${message}`);
  }

  static success(message) {
    console.log(`✅ ${message}`);
  }

  static warning(message) {
    console.log(`⚠️ ${message}`);
  }

  static error(message) {
    console.error(`❌ ${message}`);
  }

  static debug(message) {
    console.log(`🔍 ${message}`);
  }

  static bot(message) {
    console.log(`🤖 ${message}`);
  }

  static user(message) {
    console.log(`👤 ${message}`);
  }

  static image(message) {
    console.log(`🖼️ ${message}`);
  }

  static link(message) {
    console.log(`🔗 ${message}`);
  }

  static random(message) {
    console.log(`🎲 ${message}`);
  }

  static counter(message) {
    console.log(`📊 ${message}`);
  }

  static delete(message) {
    console.log(`🗑️ ${message}`);
  }

  static replace(message) {
    console.log(`🔄 ${message}`);
  }

  static timer(message) {
    console.log(`⏰ ${message}`);
  }
}
