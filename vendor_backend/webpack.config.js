const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',  // Ensure the build is targeting Node.js
  entry: './app.js',  // Your entry file
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  externals: [nodeExternals()],
  node: {
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
  },
  module: {
    rules: [
      {
        test: /\.js$/,  // Transpile JavaScript files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],  // Add the appropriate presets
          },
        },
      },
    ],
  },
};
