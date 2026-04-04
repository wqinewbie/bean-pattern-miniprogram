const ENV = 'dev';

const envConfig = {
  dev: require('./config.dev'),
  prod: require('./config.prod')
};

module.exports = envConfig[ENV] || envConfig.dev;
