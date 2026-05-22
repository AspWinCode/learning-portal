process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.GENERATE_SOURCEMAP = process.env.GENERATE_SOURCEMAP || 'false';

const webpack = require('webpack');
const configFactory = require('react-scripts/config/webpack.config');

const config = configFactory('production');
config.optimization = {
  ...(config.optimization || {}),
  minimize: false,
};
config.plugins = [...(config.plugins || []), new webpack.ProgressPlugin()];

webpack(config, (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const info = stats.toJson({ all: false, errors: true, warnings: true });
  if (stats.hasErrors()) {
    console.error(info.errors);
    process.exit(1);
  }

  if (stats.hasWarnings()) {
    console.log(info.warnings);
  }

  console.log('webpack-ok');
  process.exit(0);
});
