const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
  entry: './src/index.js', // Adjust the entry point to your main JS file
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    libraryTarget: 'umd'  // 让 bundle.js 适用于所有环境
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // If you're using Babel for transpiling
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env), // Pass the environment variables to the build
    }),
  ],
  optimization: {
    minimize: true, // Minify the code
  },
};

