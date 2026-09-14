const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  webpack: {
    plugins: [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',  // Outputs analysis as a static HTML file
        openAnalyzer: false,
      }),
    ],
    configure: (webpackConfig, { env, paths }) => {
      if (env === 'production') {
        // Disable JavaScript source maps
        webpackConfig.devtool = false;
        webpackConfig.optimization.splitChunks = {
          chunks: 'all',
        };
      }
      return webpackConfig;
    },
  },
}