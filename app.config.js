module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_PUBLIC_BASE_PATH ? { baseUrl: process.env.EXPO_PUBLIC_BASE_PATH } : {}) },
  extra: { ...config.extra, deploymentStage: process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? 'public-feedback-demo' : 'local-demo' },
});
