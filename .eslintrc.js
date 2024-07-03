module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-shadow': [0],
    'prettier/prettier': ['warn'], // Change "error" to "warn" to make issues warnings (yellow squiggles)
    'no-unused-vars': 'warn',
    eqeqeq: 'error',
    'max-len': ['warn', {code: 120, ignoreComments: true}],
  },
};
