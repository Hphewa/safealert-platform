module.exports = function configureBabel(api) {
  api.cache(true);
  const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

  return {
    presets: [require.resolve('babel-preset-expo')],
    plugins: [expoRouterBabelPlugin]
  };
};
