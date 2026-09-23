/* ESLint flat config — chọn lọc: nhóm lỗi logic (không khai báo, dùng biến
 * chưa gán, gọi hàm không tồn tại) là ERROR; nhóm phong cách chỉ WARNING để
 * không chặn CI trong lúc codebase vẫn là ES5 pre-strict. */
module.exports = [
  {
    files: ['js/**/*.js', 'server/**/*.js', 'tools/**/*.js', 'web/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'writable', global: 'writable', console: 'readonly',
        process: 'readonly', Buffer: 'readonly', fetch: 'readonly',
        document: 'readonly', localStorage: 'readonly', setTimeout: 'readonly',
        setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', performance: 'readonly', navigator: 'readonly',
        Blob: 'readonly', FileReader: 'readonly', location: 'writable',
        confirm: 'readonly', alert: 'readonly', XMLHttpRequest: 'readonly',
        WebSocket: 'readonly', history: 'readonly', screen: 'readonly',
        innerWidth: 'readonly', innerHeight: 'readonly',
        getComputedStyle: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
        FormData: 'readonly', Headers: 'readonly', Response: 'readonly',
        Request: 'readonly', AbortController: 'readonly', TextEncoder: 'readonly',
        TextDecoder: 'readonly', atob: 'readonly', btoa: 'readonly',
        structuredClone: 'readonly', queueMicrotask: 'readonly',
        require: 'readonly', module: 'writable', exports: 'writable',
        __dirname: 'readonly', __filename: 'readonly', setImmediate: 'readonly',
        clearImmediate: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-keys': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'warn',
      'use-isnan': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-async-promise-executor': 'error',
      'no-implicit-globals': 'off',       // codebase dùng window.G một chủ ý
      'no-eval': 'off',                   // server/rules.js nạp bộ luật bằng eval một chủ ý
      'eqeqeq': ['warn', 'smart'],
      'prefer-const': 'off'
    },
    ignores: ['dist/**']
  }
];