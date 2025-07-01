module.exports = {
  staticFileGlobs: [
    'index.html',
    'mstile-144x144.png',
    'browserconfig.xml'
  ],
  navigateFallback: '/index.html',
  navigateFallbackWhitelist: [/^\/user\//],
  skipWaiting: true,
  runtimeCaching: [
      {
          urlPattern: '/',
          handler: 'networkFirst',
          options: {
              cache: {
                  name: 'src'
              }
          }
      },
      {
          urlPattern: /src/,
          handler: 'networkFirst',
          options: {
              cache: {
                  name: 'src'
              }
          }
      },
      {
          urlPattern: /^https:\/\/api\.github\.com\/users\/[^\/]*\?/,
          handler: 'cacheFirst',
          options: {
              cache: {
                  maxAgeSeconds: 60 * 60 * 4,
                  name: 'users'
              }
          }
      },
      {
          urlPattern: /^https:\/\/api\.github\.com\/users\/[^\/]*\/repos\?.*$/,
          handler: 'cacheFirst',
          options: {
              cache: {
                  maxAgeSeconds: 60 * 60 * 4,
                  name: 'repos'
              }
          }
      },
      {
          urlPattern: /^https:\/\/api\.github\.com\/repos/,
          handler: 'cacheFirst',
          options: {
              cache: {
                  maxAgeSeconds: 60 * 60 * 4,
                  name: 'contributors'
              }
          }
      },
      {
          urlPattern: /^https:\/\/.*\.githubusercontent\.com\//,
          handler: 'cacheFirst',
          options: {
              cache: {
                  maxAgeSeconds: 60 * 60 * 24,
                  name: 'user-images'
              }
          }
      }
  ]
};
